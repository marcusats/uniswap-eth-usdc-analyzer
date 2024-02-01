# Uniswap V3 Analytics Subgraph

## Overview

The Uniswap V3 Analytics Subgraph is designed to index and expose rich data from Uniswap V3 pools. By capturing detailed information on swaps, flash loans, fee collections, and liquidity events, this subgraph aims to serve as a robust foundation for deep statistical analysis. Special emphasis is placed on entities like market volatility, user activity, and daily statistics to provide comprehensive insights into market dynamics and trader behavior.

## Entities and Analytics

The subgraph models several entities, crucial for analytics:

- **Swap**: Records swap events, detailing transaction amounts, price impacts, and liquidity metrics.
- **FlashLoan**: Documents flash loan transactions, highlighting the dynamics of instant borrowing and repayment within transactions.
- **FeeCollection**: Tracks protocol and pool-specific fee collections, offering insights into revenue streams.
- **MarketVolatility**: Analyzes the market's reaction to trades, capturing the volatility spurred by swap activities.
- **DailyStat**: Aggregates daily market activities, including total volume, number of transactions, and liquidity, facilitating trend analysis over time.
- **UserActivity**: Profiles user engagement with the protocol, tracking metrics such as the number of swaps and total trading volume, crucial for understanding participant behavior.

These entities are designed to enable complex queries and analyses, supporting both academic research and practical application development.


## Use Cases

This subgraph can be utilized for various analytical and developmental purposes, including:

- **Market Analysis**: Investigate trading patterns, liquidity provisioning, and impact measures to gauge market sentiment and reaction.
- **Behavioral Finance Studies**: Leverage user activity data to perform behavioral finance research, understanding decision-making processes and strategies of DeFi users.
- **Decentralized Application (DApp) Development**: Build DApps that offer real-time analytics, trader insights, or educational tools based on the indexed data.
- **Statistical Modeling**: Use aggregated daily statistics and volatility measures to build predictive models for price movements, trading volumes, or liquidity changes.

## Query Examples

To query the subgraph for daily statistics:

```graphql
{
  dailyStats(first: 5) {
    id
    totalVolume
    totalTransactions
    totalLiquidity
  }
}
```
To analyze user activity:

```graphql
{
  userActivity(id: "0xUserAddress") {
    numberOfSwaps
    totalVolume
  }
}
```