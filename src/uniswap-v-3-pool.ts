import {
  Swap as SwapEvent,
  Collect as CollectEvent,
  CollectProtocol as CollectProtocolEvent,
  Flash as FlashEvent,
  IncreaseObservationCardinalityNext as IncreaseObservationCardinalityNextEvent
} from "../generated/UniswapV3Pool/UniswapV3Pool"
import {
  Swap,
  PriceImpact,
  LastSwapPerBlock,
  TradeSize,
  FeeCollection,
  FlashLoan,
  MarketVolatility,
  SwapAmount,
  FlashLoanAmount,
  ObservationCardinality,
  DailyStat, 
  UserActivity,
  RelayActivity
} from "../generated/schema"

import { BigInt, log, BigDecimal, Bytes } from '@graphprotocol/graph-ts'



function getPreviousSwapId(blockNumber: BigInt): string | null {

  let deploymentBlockNumber = BigInt.fromString("12370624");
 
  for (let currentBlock = blockNumber.minus(BigInt.fromI32(1)); currentBlock.ge(deploymentBlockNumber); currentBlock = currentBlock.minus(BigInt.fromI32(1))) {
    let lastSwapPerBlock = LastSwapPerBlock.load(currentBlock.toString());

    if (lastSwapPerBlock !== null) {
      return lastSwapPerBlock.lastSwapId;
    }
  }

  return null;
}


function convertSqrtPriceX96ToPrice(sqrtPriceX96: BigInt): BigDecimal {
 
  let precision = BigDecimal.fromString('79228162514264337593543950336') // 2^96

  let priceRatio = sqrtPriceX96.toBigDecimal().div(precision)

  return priceRatio.times(priceRatio)
}

function calculatePriceImpact(priceBefore: BigDecimal, priceAfter: BigDecimal): BigDecimal {

  if (priceBefore.equals(BigDecimal.zero())) {
    return BigDecimal.zero()
  }
  let priceDifference = priceAfter.minus(priceBefore)
  let priceImpact = priceDifference.div(priceBefore).times(BigDecimal.fromString('100'))

  return priceImpact
}


function calculateVolatility(priceBefore: BigDecimal, priceAfter: BigDecimal): BigDecimal {


  if (priceBefore.equals(BigDecimal.zero())) {
    return BigDecimal.zero();
  }

  let priceChange = priceAfter.minus(priceBefore);


  let volatility: BigDecimal;
  if (priceChange < BigDecimal.zero()) {
    volatility = priceChange.neg();
  } else {
    volatility = priceChange; 
  }

  volatility = volatility.div(priceBefore).times(BigDecimal.fromString('100'));

  return volatility;
}


export function handleSwap(event: SwapEvent): void {
  let swapId = event.transaction.hash.toHex().concat("-").concat(event.logIndex.toString());
  let swap = Swap.load(swapId);
  if (swap == null) {
    swap = new Swap(swapId);
    swap.sender = event.params.sender;
    swap.recipient = event.params.recipient;
    swap.amount0 = event.params.amount0;
    swap.amount1 = event.params.amount1;
    swap.sqrtPriceX96 = event.params.sqrtPriceX96;
    swap.liquidity = event.params.liquidity;
    swap.tick = event.params.tick;
    swap.blockNumber = event.block.number;
    swap.blockTimestamp = event.block.timestamp;
    swap.transactionHash = event.transaction.hash;
  }

  
  let previousSwapId = getPreviousSwapId(event.block.number);
  let priceBefore = BigDecimal.fromString("0");
  let priceAfter: BigDecimal;

  if (previousSwapId) {
    let previousSwap = Swap.load(previousSwapId);
    if (previousSwap) {
      priceBefore = convertSqrtPriceX96ToPrice(previousSwap.sqrtPriceX96);
    }
  } else {
    priceBefore = BigDecimal.fromString("0"); 
  }

  priceAfter = convertSqrtPriceX96ToPrice(event.params.sqrtPriceX96);
  let priceImpactValue = calculatePriceImpact(priceBefore, priceAfter);

  let priceImpact = new PriceImpact(swapId);
  priceImpact.swapEvent = swapId;
  priceImpact.priceBefore = priceBefore;
  priceImpact.priceAfter = priceAfter;
  priceImpact.impact = priceImpactValue;
  priceImpact.save();

  swap.priceImpact = priceImpact.id;


 
  let blockId = event.block.number.toString();
  let lastSwapPerBlock = LastSwapPerBlock.load(blockId);
  if (lastSwapPerBlock == null) {
    lastSwapPerBlock = new LastSwapPerBlock(blockId);
  }

  lastSwapPerBlock.lastSwapId = swapId;
  swap.lastSwapPerBlock = lastSwapPerBlock.id;
  lastSwapPerBlock.save();


  let tradeSize = TradeSize.load(swapId);
  if (tradeSize == null) {
    tradeSize = new TradeSize(swapId);
    tradeSize.swap = swapId;  
  }

  tradeSize.sizeToken0 = absBigInt(event.params.amount0);
  tradeSize.sizeToken1 = absBigInt(event.params.amount1);
  tradeSize.save();

  
  let marketVolatilityId = event.block.number.toString();
  let marketVolatility = MarketVolatility.load(marketVolatilityId);

  if (marketVolatility == null) {
    marketVolatility = new MarketVolatility(marketVolatilityId);
    marketVolatility.totalVolatility = BigDecimal.zero();
    marketVolatility.lastUpdated = event.block.number;
  }

  let volatility = calculateVolatility(priceBefore, priceAfter);
  marketVolatility.totalVolatility = marketVolatility.totalVolatility.plus(volatility);
  marketVolatility.lastUpdated = event.block.number;
  marketVolatility.save();

  let totalVolume = absBigInt(event.params.amount0).toBigDecimal().plus(absBigInt(event.params.amount1).toBigDecimal());


  updateDailyStats(event.block.timestamp, totalVolume);

  updateUserActivity(event.params.recipient, totalVolume);
  updateRelayActivity(event.params.sender, totalVolume);

  swap.save();

  let swapAmountEntity = new SwapAmount(swapId);
  swapAmountEntity.swap = swapId;
  swapAmountEntity.amountSize = absBigInt(event.params.amount0).plus(absBigInt(event.params.amount1));
  swapAmountEntity.save();
}

function updateUserActivity(userAddress: Bytes, swapVolume: BigDecimal): void {
  let userId = userAddress.toHexString();
  let userActivity = UserActivity.load(userId);

  if (!userActivity) {
    userActivity = new UserActivity(userId);
    userActivity.numberOfSwaps = BigInt.fromI32(0);
    userActivity.totalVolume = BigDecimal.zero();
  }

  userActivity.numberOfSwaps = userActivity.numberOfSwaps.plus(BigInt.fromI32(1));
  userActivity.totalVolume = userActivity.totalVolume.plus(swapVolume);

  userActivity.save();
}
function updateRelayActivity(address: Bytes, swapVolume: BigDecimal): void {
  let id = address.toHexString();
  let relayActivity = RelayActivity.load(id);

  if (!relayActivity) {
    relayActivity = new RelayActivity(id);
    relayActivity.numberOfSwaps = BigInt.fromI32(0);
    relayActivity.totalVolume = BigDecimal.zero();
  }

  relayActivity.numberOfSwaps = relayActivity.numberOfSwaps.plus(BigInt.fromI32(1));
  relayActivity.totalVolume = relayActivity.totalVolume.plus(swapVolume);

  relayActivity.save();
}

export function handleCollectProtocol(event: CollectProtocolEvent): void {
  let id = event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  let feeCollection = new FeeCollection(id)

  feeCollection.owner = event.params.sender
  feeCollection.recipient = event.params.recipient
  feeCollection.amount0 = event.params.amount0
  feeCollection.amount1 = event.params.amount1
  feeCollection.eventType = "CollectProtocol"
  feeCollection.blockNumber = event.block.number
  feeCollection.timestamp = event.block.timestamp

  feeCollection.save()
}

export function handleCollect(event: CollectEvent): void {
  let id = event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  let feeCollection = new FeeCollection(id)

  feeCollection.owner = event.params.owner
  feeCollection.recipient = event.params.recipient
  feeCollection.amount0 = event.params.amount0
  feeCollection.amount1 = event.params.amount1
  feeCollection.eventType = "Collect"
  feeCollection.blockNumber = event.block.number
  feeCollection.timestamp = event.block.timestamp

  feeCollection.save()
}

export function handleFlash(event: FlashEvent): void {
  const flashLoanId = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let flashLoan = FlashLoan.load(flashLoanId);

  if (flashLoan === null) {
    flashLoan = new FlashLoan(flashLoanId);
    flashLoan.sender = event.params.sender;
    flashLoan.recipient = event.params.recipient;
    flashLoan.amount0 = event.params.amount0;
    flashLoan.amount1 = event.params.amount1;
    flashLoan.paid0 = event.params.paid0;
    flashLoan.paid1 = event.params.paid1;
    flashLoan.blockNumber = event.block.number;
    flashLoan.timestamp = event.block.timestamp;
    flashLoan.totalFlashLoanSize = absBigInt(event.params.amount0).plus(absBigInt(event.params.amount1));
    flashLoan.numberOfLoans = BigInt.fromI32(1);
  } else {
    flashLoan.totalFlashLoanSize = flashLoan.totalFlashLoanSize.plus(absBigInt(event.params.amount0).plus(absBigInt(event.params.amount1)));
    flashLoan.numberOfLoans = flashLoan.numberOfLoans.plus(BigInt.fromI32(1));
  }

  flashLoan.save();

  let flashLoanAmountEntity = new FlashLoanAmount(flashLoanId);
  flashLoanAmountEntity.flashLoan = flashLoanId;
  flashLoanAmountEntity.amountSize = absBigInt(event.params.amount0).plus(absBigInt(event.params.amount1));
  flashLoanAmountEntity.save();

}

export function handleIncreaseObservationCardinalityNext(event: IncreaseObservationCardinalityNextEvent): void {
  let id = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let observationCardinality = new ObservationCardinality(id);

  observationCardinality.oldCardinality = event.params.observationCardinalityNextOld;
  observationCardinality.newCardinality = event.params.observationCardinalityNextNew;
  observationCardinality.timestamp = event.block.timestamp;

  observationCardinality.save();
}



function updateDailyStats(timestamp: BigInt, swapVolume: BigDecimal): void {

  let dateId = getDateId(timestamp);

  let dailyStat = DailyStat.load(dateId);

  if (!dailyStat) {
    dailyStat = new DailyStat(dateId);
    dailyStat.totalVolume = BigDecimal.zero();
    dailyStat.totalTransactions = BigInt.zero();
    dailyStat.timestamp = timestamp;

  }

  dailyStat.totalVolume = dailyStat.totalVolume.plus(swapVolume);
  dailyStat.totalTransactions = dailyStat.totalTransactions.plus(BigInt.fromI32(1));

  dailyStat.save();
}

function getDateId(timestamp: BigInt): string {
  let formatTime = timestamp.times(BigInt.fromI32(1000))
  let timesst = formatTime.toI64()
  let date = new Date(timesst);
  return date.toISOString().split('T')[0];
}

function absBigInt(value: BigInt): BigInt {
  let zero = BigInt.fromI32(0);
  if (value.lt(zero)) {
    return value.times(BigInt.fromI32(-1));
  }
  return value;
}
