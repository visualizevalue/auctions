<template>
  <Connect v-if="!isConnected" class="block">Connect To Bid</Connect>
  <FormGroup v-else ref="el">
    <FormInput
      type="number"
      v-model="value"
      :min="minimumEth"
      required
      suffix="ETH"
      class="amount"
    />
    <TransactionFlow
      :request="bidRequest"
      :text="transactionFlowConfig"
      @complete="onBid"
      skip-confirmation
      auto-close-success
    >
      <template #start="{ start }">
        <Button @click="start" class="bid"> Bid (${{ dollarPrice }}) </Button>
      </template>
    </TransactionFlow>
  </FormGroup>
</template>

<script setup>
import { formatEther } from 'viem'
import { useAccount } from '@wagmi/vue'

const { isConnected } = useAccount()

const props = defineProps({
  auction: Object,
  displayPrice: String,
  dollarPrice: String,
  bidRequest: Function,
  transactionFlowConfig: Object,
  bidComplete: Function,
})

const minimum = computed(() => props.auction.currentBidPrice || parseEther('0.001'))
const minimumEth = computed(() => formatEther(minimum.value))

const value = defineModel('value', { default: '0.00001' })
const onBid = () => {
  props.bidComplete()
}

watchEffect(() => {
  if (parseFloat(value.value) < parseFloat(minimumEth.value)) {
    nextTick(() => {
      value.value = minimumEth.value
    })
  }
})
</script>

<style scoped>
fieldset {
  container-type: inline-size;

  .amount {
    width: 100%;

    /* :deep(input) { */
    /*   text-align: center; */
    /* } */

    @container (min-width: 30rem) {
      min-width: 6rem;
      width: fit-content;
    }
  }

  .bid {
    @container (min-width: 30rem) {
      min-width: 12rem;
      width: 100%;
    }
  }
}
</style>
