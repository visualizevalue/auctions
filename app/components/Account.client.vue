<template>
  <span>
    {{ display }}
  </span>
</template>

<script setup lang="ts">
import { useAccount, useEnsName } from '@wagmi/vue'
import type { Address } from 'viem'

const props = defineProps<{
  address: Address
  currentAccountText?: string
}>()

const address = computed(() => props.address?.value || props.address)

const { address: currentAddress } = useAccount()
const isCurrent = computed(
  () => currentAddress.value?.toLowerCase() === address.value.toLowerCase()
)

const { data: ens } = useEnsName({
  address,
  chainId: 1,
})

const display = computed(() => {
  if (ens.value) return ens.value

  if (isCurrent.value) {
    // If currentAccountText prop is explicitly provided
    if (props.currentAccountText !== undefined) {
      // If it's empty string, fall through to shortAddress
      if (props.currentAccountText === '') {
        return shortAddress(address.value)
      }
      // Otherwise use the provided text
      return props.currentAccountText
    }
    // Default behavior - show "You"
    return 'You'
  }

  return shortAddress(address.value)
})
</script>
