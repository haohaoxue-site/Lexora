export function createBuddyServiceEnvironment(
  source: NodeJS.ProcessEnv,
  buddyHome: string,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    LANG: source.LANG,
    LC_ALL: source.LC_ALL,
    LEXORA_BUDDY_HOME: buddyHome,
    NO_PROXY: source.NO_PROXY,
    PATH: source.PATH,
    TMPDIR: source.TMPDIR,
    TZ: source.TZ,
    http_proxy: source.http_proxy,
    https_proxy: source.https_proxy,
    no_proxy: source.no_proxy,
  }
  return Object.fromEntries(Object.entries(environment).filter((entry): entry is [string, string] => (
    typeof entry[1] === 'string'
  )))
}
