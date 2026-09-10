<template>
  <Transition
    name="buddy-chat-disclosure"
    @before-leave="element => element.setAttribute('inert', '')"
    @leave-cancelled="element => element.removeAttribute('inert')"
  >
    <slot />
  </Transition>
</template>

<style>
.buddy-chat-disclosure-enter-active {
  transition: opacity 180ms ease-out, transform 180ms ease-out;
}

.buddy-chat-disclosure-leave-active {
  transition: opacity 150ms ease-in, transform 150ms ease-in;
  pointer-events: none;
}

.buddy-chat-disclosure-enter-from,
.buddy-chat-disclosure-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}

@media (prefers-reduced-motion: reduce) {
  .buddy-chat-disclosure-enter-active,
  .buddy-chat-disclosure-leave-active {
    transition: none;
  }
}
</style>
