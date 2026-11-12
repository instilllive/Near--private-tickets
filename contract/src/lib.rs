//! NEP-171 ticket NFTs for Private Tickets (testnet).
//! On-chain: ownership, transfer, provenance, capped resale with host royalty
//! (NEP-199), and check-in souvenir badges.
//! Off-chain (the app): events, calendar, door log.

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
    env, near, AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise,
    PromiseOrValue,
};
use std::collections::HashMap;

const BPS_DENOM: u16 = 10_000;
const DEFAULT_ROYALTY_BPS: u16 = 500; // 5%
const DEFAULT_MAX_RESALE: u128 = 10_000_000_000_000_000_000_000_000; // 10 NEAR

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
    pub host_id: AccountId,
    pub max_resale_price: U128,
    pub royalty_bps: u16,
}

#[derive(Clone, Debug, PartialEq)]
#[near(serializers = [borsh, json])]
pub struct EventPolicy {
    pub host_id: AccountId,
    pub max_resale_price: U128,
    pub royalty_bps: u16,
}

#[derive(Clone, Debug, PartialEq)]
#[near(serializers = [borsh, json])]
pub struct Listing {
    pub seller: AccountId,
    pub price: U128,
}

/// NEP-199 payout map.
#[derive(Clone, Debug, PartialEq)]
#[near(serializers = [json])]
pub struct Payout {
    pub payout: HashMap<AccountId, U128>,
}

#[derive(Clone, Debug)]
#[near(serializers = [json])]
pub struct TicketRecord {
    pub token: Token,
    pub event_id: String,
    pub event_name: String,
    pub host_id: AccountId,
    pub max_resale_price: U128,
    pub royalty_bps: u16,
    pub listing: Option<Listing>,
    pub attended_at: Option<u64>,
    pub history: Vec<TransferRecord>,
}

#[derive(PanicOnDefault)]
#[near(contract_state)]
pub struct Contract {
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,
    tickets: LookupMap<TokenId, TicketEvent>,
    provenance: LookupMap<TokenId, Vec<TransferRecord>>,
    policies: LookupMap<String, EventPolicy>,
    listings: LookupMap<TokenId, Listing>,
    attended: LookupMap<TokenId, u64>,
    attendees: LookupMap<String, bool>,
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
    Policies,
    Listings,
    Attended,
    Attendees,
}

fn assert_one_yocto() {
    if !(env::attached_deposit() == NearToken::from_yoctonear(1)) {
            fail("Requires attached deposit of exactly 1 yoctoNEAR");
        }
}

fn attendee_key(event_id: &str, account: &AccountId) -> String {
    format!("{event_id}\0{account}")
}

#[allow(deprecated)]
fn fail(message: &str) -> ! {
    env::panic(message.as_bytes())
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
        if !(!env::state_exists()) {
            fail("Already initialized");
        }
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
            policies: LookupMap::new(StorageKey::Policies),
            listings: LookupMap::new(StorageKey::Listings),
            attended: LookupMap::new(StorageKey::Attended),
            attendees: LookupMap::new(StorageKey::Attendees),
            next_id: 0,
        }
    }

    /// Host sets the max resale price (yoctoNEAR) and royalty in basis points
    /// (500 = 5%) for an event. First caller becomes the event host; later
    /// updates must come from that host or the contract owner.
    pub fn set_event_policy(
        &mut self,
        event_id: String,
        max_resale_price: U128,
        royalty_bps: u16,
    ) -> EventPolicy {
        if !((1..=64).contains(&event_id.len())) {
            fail("event_id must be 1-64 characters");
        }
        if !(royalty_bps <= BPS_DENOM) {
            fail("royalty_bps must be <= 10000");
        }
        let predecessor = env::predecessor_account_id();
        let policy = EventPolicy {
            host_id: predecessor.clone(),
            max_resale_price,
            royalty_bps,
        };
        if let Some(existing) = self.policies.get(&event_id) {
            if !(predecessor == existing.host_id || predecessor == self.tokens.owner_id) {
            fail("only the event host or contract owner can update policy");
        }
            let updated = EventPolicy {
                host_id: existing.host_id,
                max_resale_price,
                royalty_bps,
            };
            self.policies.insert(&event_id, &updated);
            return updated;
        }
        self.policies.insert(&event_id, &policy);
        policy
    }

    pub fn event_policy(&self, event_id: String) -> Option<EventPolicy> {
        self.policies.get(&event_id)
    }

    /// Mint a ticket NFT to `receiver_id`. Anyone may mint on this testnet demo
    /// (they pay the storage deposit). Cap and royalty come from the event
    /// policy, or from the optional args (which also create the policy).
    #[payable]
    pub fn nft_mint(
        &mut self,
        receiver_id: AccountId,
        event_id: String,
        event_name: String,
        token_metadata: Option<TokenMetadata>,
        max_resale_price: Option<U128>,
        royalty_bps: Option<u16>,
    ) -> Token {
        if !((1..=64).contains(&event_id.len())) {
            fail("event_id must be 1-64 characters");
        }
        if !((1..=80).contains(&event_name.len())) {
            fail("event_name must be 1-80 characters");
        }
        if let Some(bps) = royalty_bps {
            if !(bps <= BPS_DENOM) {
            fail("royalty_bps must be <= 10000");
        }
        }
        let predecessor = env::predecessor_account_id();
        let policy = if let Some(existing) = self.policies.get(&event_id) {
            existing
        } else {
            let policy = EventPolicy {
                host_id: predecessor.clone(),
                max_resale_price: max_resale_price.unwrap_or(U128(DEFAULT_MAX_RESALE)),
                royalty_bps: royalty_bps.unwrap_or(DEFAULT_ROYALTY_BPS),
            };
            self.policies.insert(&event_id, &policy);
            policy
        };

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
            extra: Some(format!(r#"{{"event_id":{}}}"#, json_str(&event_id))),
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
                host_id: policy.host_id,
                max_resale_price: policy.max_resale_price,
                royalty_bps: policy.royalty_bps,
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
            host_id: info.host_id,
            max_resale_price: info.max_resale_price,
            royalty_bps: info.royalty_bps,
            listing: self.listings.get(&token_id),
            attended_at: self.attended.get(&token_id),
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

    /// Door admission: current owner, and the ticket has not been checked in.
    pub fn can_enter(&self, token_id: TokenId, account_id: AccountId) -> bool {
        self.is_owner(token_id.clone(), account_id) && self.attended.get(&token_id).is_none()
    }

    pub fn has_attended(&self, account_id: AccountId, event_id: String) -> bool {
        self.attendees
            .get(&attendee_key(&event_id, &account_id))
            .unwrap_or(false)
    }

    /// Owner lists a ticket at `price` yoctoNEAR. Price must be > 0 and ≤ the
    /// host's cap. Attended souvenir tickets cannot be listed.
    pub fn list_resale(&mut self, token_id: TokenId, price: U128) -> Listing {
        self.assert_not_attended(&token_id);
        let owner = self
            .tokens
            .owner_by_id
            .get(&token_id)
            .unwrap_or_else(|| fail("ticket does not exist"));
        if env::predecessor_account_id() != owner {
            fail("only the owner can list");
        }
        let info = self.tickets.get(&token_id).unwrap_or_else(|| fail("ticket does not exist"));
        if price.0 == 0 {
            fail("price must be greater than zero");
        }
        if price.0 > info.max_resale_price.0 {
            fail("price exceeds the host resale cap");
        }
        let listing = Listing {
            seller: owner,
            price,
        };
        self.listings.insert(&token_id, &listing);
        listing
    }

    pub fn cancel_resale(&mut self, token_id: TokenId) {
        let listing = self.listings.get(&token_id).unwrap_or_else(|| fail("not listed"));
        let predecessor = env::predecessor_account_id();
        if !(predecessor == listing.seller || predecessor == self.tokens.owner_id) {
            fail("only the seller or contract owner can cancel");
        }
        self.listings.remove(&token_id);
    }

    /// Buyer attaches a deposit equal to the listing price. The NFT moves to
    /// the buyer, the seller receives price − royalty, the event host receives
    /// the royalty, and provenance is appended.
    #[payable]
    pub fn buy_resale(&mut self, token_id: TokenId) {
        self.assert_not_attended(&token_id);
        let listing = self.listings.get(&token_id).unwrap_or_else(|| fail("not listed"));
        let price = listing.price.0;
        if !(env::attached_deposit().as_yoctonear() == price) {
            fail("deposit must equal the listing price");
        }
        let buyer = env::predecessor_account_id();
        if !(buyer != listing.seller) {
            fail("seller cannot buy their own listing");
        }
        let owner = self
            .tokens
            .owner_by_id
            .get(&token_id)
            .unwrap_or_else(|| fail("ticket does not exist"));
        if !(owner == listing.seller) {
            fail("listing seller is no longer the owner");
        }

        let payout = self.payout_map(&token_id, price);
        self.tokens.internal_transfer(
            &listing.seller,
            &buyer,
            &token_id,
            None,
            Some("resale".to_string()),
        );
        self.listings.remove(&token_id);
        self.record_transfer(&token_id, listing.seller.clone(), buyer);
        self.pay_out(payout);
    }

    /// Host records that the current owner was admitted. The ticket becomes a
    /// "was there" souvenir: it can no longer be resold, transferred, or used
    /// at the door, and `has_attended` becomes true for that owner and event.
    pub fn check_in(&mut self, token_id: TokenId) -> u64 {
        self.assert_not_attended(&token_id);
        let info = self.tickets.get(&token_id).unwrap_or_else(|| fail("ticket does not exist"));
        let predecessor = env::predecessor_account_id();
        if !(predecessor == info.host_id || predecessor == self.tokens.owner_id) {
            fail("only the event host or contract owner can check in a guest");
        }
        let owner = self
            .tokens
            .owner_by_id
            .get(&token_id)
            .unwrap_or_else(|| fail("ticket does not exist"));
        let at = env::block_timestamp();
        self.attended.insert(&token_id, &at);
        self.attendees
            .insert(&attendee_key(&info.event_id, &owner), &true);
        self.listings.remove(&token_id);
        self.mark_souvenir(&token_id, &info, at);
        at
    }

    /// NEP-199 view: how a sale of `balance` yoctoNEAR would be split.
    pub fn nft_payout(
        &self,
        token_id: TokenId,
        balance: U128,
        max_len_payout: Option<u32>,
    ) -> Payout {
        let payout = self.payout_map(&token_id, balance.0);
        if let Some(max) = max_len_payout {
            if !(payout.payout.len() as u32 <= max) {
            fail("payout exceeds max_len_payout");
        }
        }
        payout
    }

    /// NEP-199: transfer the token and return the payout map for `balance`.
    /// Marketplaces must attach 1 yoctoNEAR and then pay the returned accounts.
    /// Attended souvenir tickets cannot be transferred.
    #[payable]
    pub fn nft_transfer_payout(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        balance: U128,
        max_len_payout: Option<u32>,
    ) -> Payout {
        assert_one_yocto();
        self.assert_not_attended(&token_id);
        let payout = self.nft_payout(token_id.clone(), balance, max_len_payout);
        let previous = self
            .tokens
            .owner_by_id
            .get(&token_id)
            .unwrap_or_else(|| fail("ticket does not exist"));
        self.tokens
            .nft_transfer(receiver_id.clone(), token_id.clone(), approval_id, memo);
        self.listings.remove(&token_id);
        self.record_transfer(&token_id, previous, receiver_id);
        payout
    }

    fn payout_map(&self, token_id: &TokenId, balance: u128) -> Payout {
        let info = self.tickets.get(token_id).unwrap_or_else(|| fail("ticket does not exist"));
        let owner = self
            .tokens
            .owner_by_id
            .get(token_id)
            .unwrap_or_else(|| fail("ticket does not exist"));
        let royalty = balance.saturating_mul(info.royalty_bps as u128) / (BPS_DENOM as u128);
        let mut payout = HashMap::new();
        if royalty > 0 && info.host_id != owner {
            payout.insert(info.host_id, U128(royalty));
            payout.insert(owner, U128(balance - royalty));
        } else {
            payout.insert(owner, U128(balance));
        }
        Payout { payout }
    }

    fn pay_out(&self, payout: Payout) {
        let amounts: Vec<(AccountId, u128)> = payout
            .payout
            .into_iter()
            .filter(|(_, amount)| amount.0 > 0)
            .map(|(account, amount)| (account, amount.0))
            .collect();
        if amounts.is_empty() {
            fail("payout is empty");
        }
        for (account, amount) in amounts {
            Promise::new(account)
                .transfer(NearToken::from_yoctonear(amount))
                .detach();
        }
    }

    fn assert_not_attended(&self, token_id: &TokenId) {
        if !(self.attended.get(token_id).is_none()) {
            fail("ticket already used as a souvenir and cannot be transferred or resold");
        }
    }

    fn mark_souvenir(&mut self, token_id: &TokenId, info: &TicketEvent, at: u64) {
        if let Some(map) = &mut self.tokens.token_metadata_by_id {
            if let Some(mut md) = map.get(token_id) {
                md.title = Some(format!("{} — was there", info.event_name));
                md.description = Some("Souvenir badge. This ticket was checked in and can no longer be resold or reused at the door.".to_string());
                md.updated_at = Some(at.to_string());
                md.extra = Some(format!(
                    r#"{{"event_id":{},"attended_at":{},"souvenir":true}}"#,
                    json_str(&info.event_id),
                    at
                ));
                map.insert(token_id, &md);
            }
        }
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

fn json_str(value: &str) -> String {
    let mut out = String::from("\"");
    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            c => out.push(c),
        }
    }
    out.push('"');
    out
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
        self.assert_not_attended(&token_id);
        let previous = self
            .tokens
            .owner_by_id
            .get(&token_id)
            .unwrap_or_else(|| fail("ticket does not exist"));
        self.tokens
            .nft_transfer(receiver_id.clone(), token_id.clone(), approval_id, memo);
        self.listings.remove(&token_id);
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
        self.assert_not_attended(&token_id);
        self.listings.remove(&token_id);
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
    const ONE_NEAR: u128 = 1_000_000_000_000_000_000_000_000;
    const TEN_NEAR: u128 = 10 * ONE_NEAR;

    fn get_context(predecessor: AccountId) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(accounts(0))
            .signer_account_id(predecessor.clone())
            .predecessor_account_id(predecessor);
        builder
    }

    fn mint(contract: &mut Contract, ctx: &mut VMContextBuilder, receiver: AccountId) -> Token {
        mint_with(contract, ctx, receiver, "evt-1", "Demo Night", None, None)
    }

    fn mint_with(
        contract: &mut Contract,
        ctx: &mut VMContextBuilder,
        receiver: AccountId,
        event_id: &str,
        event_name: &str,
        cap: Option<U128>,
        bps: Option<u16>,
    ) -> Token {
        testing_env!(ctx
            .storage_usage(env::storage_usage())
            .attached_deposit(MINT_STORAGE_COST)
            .predecessor_account_id(accounts(0))
            .build());
        contract.nft_mint(
            receiver,
            event_id.into(),
            event_name.into(),
            None,
            cap,
            bps,
        )
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
        assert_eq!(record.royalty_bps, DEFAULT_ROYALTY_BPS);
        assert_eq!(record.max_resale_price.0, DEFAULT_MAX_RESALE);
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

    #[test]
    #[should_panic(expected = "price exceeds the host resale cap")]
    fn over_cap_listing_is_rejected() {
        let mut ctx = get_context(accounts(0));
        testing_env!(ctx.build());
        let mut contract = Contract::new_default_meta(accounts(0));
        let token = mint_with(
            &mut contract,
            &mut ctx,
            accounts(1),
            "evt-cap",
            "Cap Night",
            Some(U128(ONE_NEAR)),
            Some(500),
        );
        testing_env!(ctx
            .storage_usage(env::storage_usage())
            .predecessor_account_id(accounts(1))
            .build());
        contract.list_resale(token.token_id, U128(2 * ONE_NEAR));
    }

    #[test]
    fn payout_split_is_correct() {
        let mut ctx = get_context(accounts(0));
        testing_env!(ctx.build());
        let mut contract = Contract::new_default_meta(accounts(0));
        let token = mint_with(
            &mut contract,
            &mut ctx,
            accounts(1),
            "evt-pay",
            "Pay Night",
            Some(U128(TEN_NEAR)),
            Some(500),
        );
        let payout = contract.nft_payout(token.token_id, U128(TEN_NEAR), Some(10));
        assert_eq!(payout.payout.get(&accounts(0)).unwrap().0, TEN_NEAR / 20); // 5%
        assert_eq!(payout.payout.get(&accounts(1)).unwrap().0, TEN_NEAR * 19 / 20);
        assert_eq!(payout.payout.len(), 2);
    }

    #[test]
    fn resale_pays_and_door_follows_new_owner() {
        let mut ctx = get_context(accounts(0));
        testing_env!(ctx.build());
        let mut contract = Contract::new_default_meta(accounts(0));
        let token = mint_with(
            &mut contract,
            &mut ctx,
            accounts(1),
            "evt-sale",
            "Sale Night",
            Some(U128(TEN_NEAR)),
            Some(500),
        );
        let token_id = token.token_id.clone();
        testing_env!(ctx
            .storage_usage(env::storage_usage())
            .predecessor_account_id(accounts(1))
            .build());
        contract.list_resale(token_id.clone(), U128(TEN_NEAR));

        testing_env!(ctx
            .storage_usage(env::storage_usage())
            .attached_deposit(NearToken::from_yoctonear(TEN_NEAR))
            .predecessor_account_id(accounts(2))
            .build());
        contract.buy_resale(token_id.clone());

        let record = contract.ticket_record(token_id.clone()).unwrap();
        assert_eq!(record.token.owner_id, accounts(2));
        assert!(record.listing.is_none());
        assert_eq!(record.history.len(), 2);
        assert!(contract.can_enter(token_id.clone(), accounts(2)));
        assert!(!contract.can_enter(token_id.clone(), accounts(1)));
        assert!(contract.is_owner(token_id.clone(), accounts(2)));
        assert!(!contract.is_owner(token_id, accounts(1)));
    }

    #[test]
    fn check_in_marks_attended_and_blocks_resale_and_reuse() {
        let mut ctx = get_context(accounts(0));
        testing_env!(ctx.build());
        let mut contract = Contract::new_default_meta(accounts(0));
        let token = mint(&mut contract, &mut ctx, accounts(1));
        let token_id = token.token_id.clone();
        assert!(contract.can_enter(token_id.clone(), accounts(1)));
        assert!(!contract.has_attended(accounts(1), "evt-1".into()));

        testing_env!(ctx
            .storage_usage(env::storage_usage())
            .predecessor_account_id(accounts(0))
            .block_timestamp(42)
            .build());
        let at = contract.check_in(token_id.clone());
        assert_eq!(at, 42);

        let record = contract.ticket_record(token_id.clone()).unwrap();
        assert_eq!(record.attended_at, Some(42));
        let md = record.token.metadata.unwrap();
        assert!(md.title.unwrap().contains("was there"));
        assert!(md.extra.unwrap().contains("souvenir"));
        assert!(contract.has_attended(accounts(1), "evt-1".into()));
        assert!(!contract.can_enter(token_id.clone(), accounts(1)));
        assert!(contract.is_owner(token_id.clone(), accounts(1)));
    }

    #[test]
    #[should_panic(expected = "already used as a souvenir")]
    fn used_ticket_cannot_be_resold() {
        let mut ctx = get_context(accounts(0));
        testing_env!(ctx.build());
        let mut contract = Contract::new_default_meta(accounts(0));
        let token = mint(&mut contract, &mut ctx, accounts(1));
        testing_env!(ctx
            .storage_usage(env::storage_usage())
            .predecessor_account_id(accounts(0))
            .build());
        contract.check_in(token.token_id.clone());
        testing_env!(ctx
            .storage_usage(env::storage_usage())
            .predecessor_account_id(accounts(1))
            .build());
        contract.list_resale(token.token_id, U128(ONE_NEAR));
    }

    #[test]
    #[should_panic(expected = "already used as a souvenir")]
    fn used_ticket_cannot_be_checked_in_again() {
        let mut ctx = get_context(accounts(0));
        testing_env!(ctx.build());
        let mut contract = Contract::new_default_meta(accounts(0));
        let token = mint(&mut contract, &mut ctx, accounts(1));
        testing_env!(ctx
            .storage_usage(env::storage_usage())
            .predecessor_account_id(accounts(0))
            .build());
        contract.check_in(token.token_id.clone());
        contract.check_in(token.token_id);
    }
}
