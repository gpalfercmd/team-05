# Proof of Aid Hackathon — The Essentials in 5 Minutes

The goal is not to learn blockchain from scratch or follow a predefined architecture. The idea is to arrive at the hackathon with a basic understanding of the main concepts and **building blocks** involved in an aid traceability application.

The reference application is just that: a reference. Feel free to change the approach, architecture, and technologies.

## 1. Fundamental concepts

### Wallets

A **wallet** represents an account that can interact with a blockchain.

In practice, it controls a private key that can be used to **sign** actions and transactions.

Three important ideas:

* a **public address** identifies the account;
* a **private key** authorizes actions and must never be shared;
* a **signature** proves that a particular wallet authorized an action.

A wallet proves control over a cryptographic key, but it does **not** by itself prove who the person or organization behind it is.

### Smart contracts

A **smart contract** is code that runs on a blockchain and maintains shared state.

It can define rules such as:

* who can register aid;
* who can certify a delivery;
* what evidence is associated with an action;
* which participants have verified something.

Operations that modify contract state are **transactions**.

Smart contracts can also emit **events**, which external applications can use to track what is happening onchain.

### Onchain vs offchain

Not everything belongs on a blockchain.

**Onchain** makes sense for information that needs to be:

* independently verifiable;
* auditable;
* difficult to modify;
* shared between parties that do not fully trust each other.

**Offchain** is generally better for:

* documents;
* photographs;
* personal information;
* large amounts of data;
* information that may need to be modified or deleted.

A common pattern is to store the full information offchain and record only a **cryptographic proof**, such as a hash, onchain.

```text
Document / photo / evidence
            │
            ▼
      Offchain storage
            │
           hash
            │
            ▼
        Blockchain
```

## 2. Building blocks of an application

A solution like this will usually combine traditional application components with blockchain components.

```text
                         ┌──────────────┐
                         │   Frontend   │
                         └──────┬───────┘
                                │
                 ┌──────────────┴──────────────┐
                 │                             │
                 ▼                             ▼
        ┌─────────────────┐           ┌─────────────────┐
        │ Backend / API   │           │ Wallet / signer │
        └────────┬────────┘           └────────┬────────┘
                 │                             │
        ┌────────┴────────┐                    ▼
        │                 │           ┌─────────────────┐
        ▼                 ▼           │ Smart contracts │
    Database         File storage     │   Blockchain    │
                                            │
                                            ▼
                                      Events / proofs
```

The **frontend** is the interface used by beneficiaries, organizations, verifiers, or other participants.

The **backend** handles logic that does not need to live onchain: validation, internal processes, search, integration with other systems, and synchronization between onchain and offchain data.

The **database** stores the operational data of the application. There is no benefit in putting data onchain if it can be handled perfectly well by a conventional database.

**File storage** keeps photographs, documents, and other evidence. The file itself normally stays offchain, while a reference or hash can be recorded onchain to prove later that it has not been modified.

**Identity** answers a different question: who is performing this action? It may involve traditional user accounts, organizations, wallets, or a combination of them. Identity and wallet are not necessarily the same thing.

A **wallet or signer** authorizes actions cryptographically. It may belong to a person, an organization, or even an automated system.

**Smart contracts** maintain the part of the system state that needs to be independently verifiable.

The **blockchain** provides the shared ledger where contracts execute and transactions are recorded.

Finally, applications often need to read contract **events** and transform them into data that is easy to query for timelines, dashboards, search, or audit history.

## 3. The real-world problem

Blockchain can prove something like:

> “This wallet recorded this information at this point in time, and it has not been modified since.”

But it cannot automatically prove:

> “This aid was actually delivered to the intended recipient.”

That gap between the physical world and the digital world is one of the most interesting parts of the problem.

Think about what mechanisms could add trust:

* multiple organizations verifying an action;
* photographs or documents;
* geolocation;
* signatures from different participants;
* independent verifiers;
* attestations;
* external data sources.

This is closely related to the **oracle problem**: how real-world facts become trusted digital information.

## 4. A minimal example flow

A prototype does not need to solve the whole problem.

For example:

```text
Organization records an aid delivery
            │
            ▼
Description + evidence are stored
            │
            ▼
A hash of the evidence is calculated
            │
            ▼
A wallet signs the action
            │
            ▼
The smart contract records
the reference and the hash
            │
            ▼
Another participant can later
verify that the evidence is unchanged
```

At this point there is already a complete flow between the **offchain** and **onchain** parts of the system.

## 5. How to approach the hackathon

Start with this question:

**What should someone who does not fully trust us be able to verify?**

Then decide which building blocks are needed to make that possible.

A good first objective could be:

**record aid → attach evidence → create a verifiable proof → allow a third party to verify it**

Once that works end to end, you can add identity, roles, multiple organizations, verifiers, geolocation, dashboards, or other features.

Blockchain should solve a concrete problem around **trust, auditability, or verification**.

If something works better offchain, keep it offchain.

## 6. Technologies you may consider

There is no required stack. Use technologies your team knows well or that allow you to move quickly.

For web development, **React, Next.js, and TypeScript** are common choices. **Vercel** is useful for deploying a web application quickly and connecting it directly to a GitHub repository.

For backend development, use whatever language the team is comfortable with. **Python, Rust, Java, and TypeScript** are all perfectly valid options.

For persistence, **PostgreSQL** is a strong and flexible choice for almost everything a prototype like this is likely to need.

For the blockchain side, an EVM-compatible network such as **Arbitrum Sepolia** allows you to work on testnet using the Ethereum ecosystem.

Smart contracts can be written in **Solidity**, while **Foundry** provides tooling to compile, test, and deploy them.

**OpenZeppelin Contracts** provides standard implementations for access control, ownership, and other common smart contract patterns.

From a web application, libraries such as **viem** or **wagmi** can be used to read contracts, send transactions, and connect wallets.

For wallets, you can use a traditional wallet such as **MetaMask**, or tools such as **Privy** that abstract some of the wallet complexity and provide a more conventional user experience.

If you have never built a dapp before, **Scaffold-ETH 2** is a useful reference because it shows how frontend, wallets, smart contracts, and blockchain fit together in a single project.

The objective is not to use many technologies. The objective is to make **one small end-to-end flow work clearly and reliably**.
