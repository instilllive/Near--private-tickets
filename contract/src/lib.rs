//! NEP-171 ticket NFTs for Private Tickets.
//! On-chain: ownership, transfer, provenance.
//! Off-chain (the app): events, calendar, door check-in records.

use near_contract_standards::non_fungible_token::approval::NonFungibleTokenApproval;
use near_contract_standards::non_fungible_token::core::{
    NonFungibleTokenCore, NonFungibleTokenResolver,
};
use near_contract_standards::non_fungible_token::enumeration::NonFungibleTokenEnumeration;
use near_contract_standards::non_fungible_token::metadata::{
    NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata, NFT_METADATA_SPEC,
};
use near_contract_standards::non_fungible_token::{NonFungibleToken, Token, TokenId};
use near_sdk::collections::{LazyOption, LookupMap};
use near_sdk::json_types::U128;
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, PanicOnDefault, Promise, PromiseOrValue,
};
use std::collections::HashMap;

#[derive(Clone, Debug, PartialEq)]
#[near(serializers = [borsh, json])]
pub struct TransferRecord {
    pub from: Option<AccountId>,
    pub to: AccountId,
    pub at: u64,
}

#[derive(Clone, Debug, PartialEq)]
#[near(serializers = [borsh, json])]
pub struct TicketEvent {
    pub event_id: String,
    pub event_name: String,
}

#[derive(Clone, Debug)]
#[near(serializers = [json])]
pub struct TicketRecord {
    pub token: Token,
    pub event_id: String,
    pub event_name: String,
    pub history: Vec<TransferRecord>,
}

#[derive(PanicOnDefault)]
#[near(contract_state)]
pub struct Contract {
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,
    tickets: LookupMap<TokenId, TicketEvent>,
    provenance: LookupMap<TokenId, Vec<TransferRecord>>,
    next_id: u64,
}

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    NonFungibleToken,
    Metadata,
    TokenMetadata,
    Enumeration,
    Approval,
    Tickets,
    Provenance,
}

#[near]
impl Contract {
    #[init]
    pub fn new_default_meta(owner_id: AccountId) -> Self {
        Self::new(
            owner_id,
            NFTContractMetadata {
                spec: NFT_METADATA_SPEC.to_string(),
                name: "Private Tickets".to_string(),
                symbol: "PTIX".to_string(),
                icon: None,
                base_uri: None,
                reference: None,
                reference_hash: None,
            },
        )
    }

    #[init]
    pub fn new(owner_id: AccountId, metadata: NFTContractMetadata) -> Self {
        require!(!env::state_exists(), "Already initialized");
        metadata.assert_valid();
        Self {
            tokens: NonFungibleToken::new(
                StorageKey::NonFungibleToken,
                owner_id,
                Some(StorageKey::TokenMetadata),
                Some(StorageKey::Enumeration),
                Some(StorageKey::Approval),
            ),
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
            tickets: LookupMap::new(StorageKey::Tickets),
            provenance: LookupMap::new(StorageKey::Provenance),
            next_id: 0,
        }
    }

    /// Mint a ticket NFT to `receiver_id`. Anyone may mint on this testnet demo
    /// (they pay the storage deposit). `event_id` / `event_name` are recorded on
    /// the token; the event calendar itself stays in the app.
    #[payable]
    pub fn nft_mint(
        &mut self,
        receiver_id: AccountId,
        event_id: String,
        event_name: String,
        token_metadata: Option<TokenMetadata>,
    ) -> Token {
        require!(
            (1..=64).contains(&event_id.len()),
            "event_id must be 1-64 characters"
        );
        require!(
            (1..=80).contains(&event_name.len()),
            "event_name must be 1-80 characters"
        );
        self.next_id += 1;
        let token_id = format!("ticket-{}", self.next_id);
        let metadata = token_metadata.unwrap_or(TokenMetadata {
            title: Some(format!("{event_name} ticket")),
            description: Some(format!("Private Tickets pass for {event_name}")),
            media: None,
            media_hash: None,
            copies: Some(1),
            issued_at: Some(env::block_timestamp().to_string()),
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: Some(format!(r#"{{"event_id":"{event_id}"}}"#)),
            reference: None,
            reference_hash: None,
        });
        let token = self
            .tokens
            .internal_mint(token_id.clone(), receiver_id.clone(), Some(metadata));
        self.tickets.insert(
            &token_id,
            &TicketEvent {
                event_id,
                event_name,
            },
        );
        self.provenance.insert(
            &token_id,
            &vec![TransferRecord {
                from: None,
                to: receiver_id,
                at: env::block_timestamp(),
            }],
        );
        token
    }

    pub fn ticket_record(&self, token_id: TokenId) -> Option<TicketRecord> {
        let token = self.tokens.nft_token(token_id.clone())?;
        let info = self.tickets.get(&token_id)?;
        let history = self.provenance.get(&token_id).unwrap_or_default();
        Some(TicketRecord {
            token,
            event_id: info.event_id,
            event_name: info.event_name,
            history,
        })
    }

    /// Door check: is `account_id` the current on-chain owner of this ticket?
    pub fn is_owner(&self, token_id: TokenId, account_id: AccountId) -> bool {
        self.tokens
            .nft_token(token_id)
            .map(|t| t.owner_id == account_id)
            .unwrap_or(false)
    }

    fn record_transfer(&mut self, token_id: &TokenId, from: AccountId, to: AccountId) {
        let mut history = self.provenance.get(token_id).unwrap_or_default();
        history.push(TransferRecord {
            from: Some(from),
            to,
            at: env::block_timestamp(),
        });
        self.provenance.insert(token_id, &history);
    }
}

#[near]
impl NonFungibleTokenCore for Contract {
    #[payable]
    fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        let previous = self
            .tokens
            .owner_by_id
            .get(&token_id)
            .expect("ticket does not exist");
        self.tokens
            .nft_transfer(receiver_id.clone(), token_id.clone(), approval_id, memo);
        self.record_transfer(&token_id, previous, receiver_id);
    }

    #[payable]
    fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        self.tokens
            .nft_transfer_call(receiver_id, token_id, approval_id, memo, msg)
    }

    fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.tokens.nft_token(token_id)
    }
}

#[near]
impl NonFungibleTokenResolver for Contract {
    #[private]
    fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: TokenId,
        approved_account_ids: Option<HashMap<AccountId, u64>>,
    ) -> bool {
        let kept = self.tokens.nft_resolve_transfer(
            previous_owner_id.clone(),
            receiver_id.clone(),
            token_id.clone(),
            approved_account_ids,
        );
        if kept {
            self.record_transfer(&token_id, previous_owner_id, receiver_id);
        }
        kept
    }
}

#[near]
impl NonFungibleTokenApproval for Contract {
    #[payable]
    fn nft_approve(
        &mut self,
        token_id: TokenId,
        account_id: AccountId,
        msg: Option<String>,
    ) -> Option<Promise> {
        self.tokens.nft_approve(token_id, account_id, msg)
    }

    #[payable]
    fn nft_revoke(&mut self, token_id: TokenId, account_id: AccountId) {
        self.tokens.nft_revoke(token_id, account_id);
    }

    #[payable]
    fn nft_revoke_all(&mut self, token_id: TokenId) {
        self.tokens.nft_revoke_all(token_id);
    }

    fn nft_is_approved(
        &self,
        token_id: TokenId,
        approved_account_id: AccountId,
        approval_id: Option<u64>,
    ) -> bool {
        self.tokens
            .nft_is_approved(token_id, approved_account_id, approval_id)
    }
}

#[near]
impl NonFungibleTokenEnumeration for Contract {
    fn nft_total_supply(&self) -> U128 {
        self.tokens.nft_total_supply()
    }

    fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.tokens.nft_tokens(from_index, limit)
    }

    fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        self.tokens.nft_supply_for_owner(account_id)
    }

    fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<Token> {
        self.tokens
            .nft_tokens_for_owner(account_id, from_index, limit)
    }
}

#[near]
impl NonFungibleTokenMetadataProvider for Contract {
    fn nft_metadata(&self) -> NFTContractMetadata {
        self.metadata.get().unwrap()
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::{testing_env, NearToken};

    const MINT_STORAGE_COST: NearToken = NearToken::from_yoctonear(8_000_000_000_000_000_000_000);

    fn get_context(predecessor: AccountId) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(accounts(0))
            .signer_account_id(predecessor.clone())
            .predecessor_account_id(predecessor);
        builder
    }

    fn mint(contract: &mut Contract, ctx: &mut VMContextBuilder, receiver: AccountId) -> Token {
        testing_env!(ctx
            .storage_usage(env::storage_usage())
            .attached_deposit(MINT_STORAGE_COST)
            .predecessor_account_id(accounts(0))
            .build());
        contract.nft_mint(receiver, "evt-1".into(), "Demo Night".into(), None)
    }

    #[test]
    fn mint_assigns_owner_and_provenance() {
        let mut ctx = get_context(accounts(0));
        testing_env!(ctx.build());
        let mut contract = Contract::new_default_meta(accounts(0));
        let token = mint(&mut contract, &mut ctx, accounts(1));
        assert_eq!(token.token_id, "ticket-1");
        assert_eq!(token.owner_id, accounts(1));
        let record = contract.ticket_record(token.token_id.clone()).unwrap();
        assert_eq!(record.event_id, "evt-1");
        assert_eq!(record.event_name, "Demo Night");
        assert_eq!(record.history.len(), 1);
        assert_eq!(record.history[0].from, None);
        assert_eq!(record.history[0].to, accounts(1));
        assert!(contract.is_owner(token.token_id, accounts(1)));
    }

    #[test]
    fn transfer_moves_ownership_and_appends_provenance() {
        let mut ctx = get_context(accounts(0));
        testing_env!(ctx.build());
        let mut contract = Contract::new_default_meta(accounts(0));
        let token = mint(&mut contract, &mut ctx, accounts(1));
        let token_id = token.token_id.clone();

        testing_env!(ctx
            .storage_usage(env::storage_usage())
            .attached_deposit(NearToken::from_yoctonear(1))
            .predecessor_account_id(accounts(1))
            .build());
        contract.nft_transfer(accounts(2), token_id.clone(), None, None);

        let record = contract.ticket_record(token_id.clone()).unwrap();
        assert_eq!(record.token.owner_id, accounts(2));
        assert_eq!(record.history.len(), 2);
        assert_eq!(record.history[1].from, Some(accounts(1)));
        assert_eq!(record.history[1].to, accounts(2));
        assert!(contract.is_owner(token_id.clone(), accounts(2)));
        assert!(!contract.is_owner(token_id, accounts(1)));
    }

    #[test]
    fn door_rejects_previous_owner() {
        let mut ctx = get_context(accounts(0));
        testing_env!(ctx.build());
        let mut contract = Contract::new_default_meta(accounts(0));
        let token = mint(&mut contract, &mut ctx, accounts(1));
        testing_env!(ctx
            .storage_usage(env::storage_usage())
            .attached_deposit(NearToken::from_yoctonear(1))
            .predecessor_account_id(accounts(1))
            .build());
        contract.nft_transfer(accounts(2), token.token_id.clone(), None, None);
        assert!(!contract.is_owner(token.token_id, accounts(1)));
    }
}
