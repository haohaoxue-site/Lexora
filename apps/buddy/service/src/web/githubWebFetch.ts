import type { PublicWebGet } from '../../../shared/network/publicWebTransport'
import type { WebDocument } from './webContent'
import { Buffer } from 'node:buffer'
import { z } from 'zod'
import { requireWebSuccess } from '../../../shared/network/publicWebTransport'
import { WebError } from '../../../shared/webProtocol'

const contentSchema = z.object({ type: z.string().optional(), content: z.string(), encoding: z.literal('base64'), size: z.number() })
const issueSchema = z.object({ title: z.string(), body: z.string().nullable(), comments: z.number(), state: z.string(), user: z.object({ login: z.string() }) })
const commentsSchema = z.array(z.object({ body: z.string(), user: z.object({ login: z.string() }).nullable(), html_url: z.string() }))

export async function githubWebFetch(get: PublicWebGet, url: URL, signal: AbortSignal): Promise<WebDocument | null> {
  if (url.hostname !== 'github.com')
    return null
  const [owner, repo, kind, id, ...rest] = url.pathname.split('/').filter(Boolean)
  if (!owner || !repo || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo))
    return null
  if (kind === 'blob' && rest.length > 1)
    return null
  const base = `https://api.github.com/repos/${owner}/${repo}`
  const getJson = async (path: string): Promise<unknown> => {
    const resource = await get(`${base}${path}`, signal, 8 * 1024 * 1024)
    requireWebSuccess(resource.status)
    try {
      return JSON.parse(new TextDecoder().decode(resource.bytes)) as unknown
    }
    catch { throw new WebError('WEB_INVALID_RESPONSE') }
  }
  const result: WebDocument = { url: url.href, title: `${owner}/${repo}`, content: '', contentType: 'text/markdown', acquisitionIncomplete: false, warnings: [], handler: 'github' }
  if (!kind || (kind === 'blob' && id && rest.length)) {
    const response = contentSchema.safeParse(await getJson(!kind ? '/readme' : `/contents/${rest.map(part => encodeURIComponent(decodeURIComponent(part))).join('/')}?ref=${encodeURIComponent(decodeURIComponent(id!))}`))
    if (!response.success)
      throw new WebError('WEB_INVALID_RESPONSE')
    const bytes = Buffer.from(response.data.content.replace(/\s/g, ''), 'base64')
    if (bytes.includes(0))
      throw new WebError('WEB_UNSUPPORTED_CONTENT')
    result.content = new TextDecoder().decode(bytes)
    result.acquisitionIncomplete = bytes.byteLength < response.data.size
    result.title += !kind ? ' README' : ` ${rest.join('/')}`
    return result
  }
  if (!['issues', 'pull'].includes(kind) || !id || !/^\d+$/.test(id) || rest.length)
    return null
  const issue = issueSchema.parse(await getJson(`/issues/${id}`))
  result.title = `${result.title} #${id}: ${issue.title}`
  result.content = `# ${issue.title}\n\nAuthor: ${issue.user.login}\nState: ${issue.state}\n\n${issue.body ?? ''}`
  if (issue.comments) {
    const comments = commentsSchema.parse(await getJson(`/issues/${id}/comments?per_page=100`))
    result.content += comments.map(comment => `\n\n## Comment by ${comment.user?.login ?? 'deleted user'}\n${comment.html_url}\n\n${comment.body}`).join('')
    result.acquisitionIncomplete = comments.length < issue.comments
  }
  if (kind === 'pull') {
    const reviewComments = commentsSchema.parse(await getJson(`/pulls/${id}/comments?per_page=100`))
    result.content += reviewComments.map(comment => `\n\n## Review comment by ${comment.user?.login ?? 'deleted user'}\n${comment.html_url}\n\n${comment.body}`).join('')
    const files = z.array(z.object({ filename: z.string(), status: z.string(), patch: z.string().optional() })).parse(await getJson(`/pulls/${id}/files?per_page=100`))
    result.content += files.map(file => `\n\n## ${file.filename} (${file.status})\n\n${file.patch ? `\u0060\u0060\u0060diff\n${file.patch}\n\u0060\u0060\u0060` : '[Diff unavailable]'}`).join('')
    result.acquisitionIncomplete = true
    result.warnings.push('PR includes up to 100 files and 100 review comments. API patches may be incomplete; review summaries and checks are not included.')
  }
  return result
}
