abi <abi/4.0>,
include <tunables/global>

profile "${executable}" "/opt/${sanitizedProductName}/${executable}" flags=(unconfined) {
  userns,
  include if exists <local/${executable}>
}

profile "${executable}-shell" "/opt/${sanitizedProductName}/resources/shell-sandbox/bwrap" flags=(unconfined) {
  userns,
  include if exists <local/${executable}-shell>
}
