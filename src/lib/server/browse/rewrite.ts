/**
 * HTML rewriting for /api/browse.
 *
 * The frame stays on an OPAQUE origin (the iframe keeps its sandbox without
 * `allow-same-origin`), so the proxied site can never touch our localStorage or
 * the VFS. Because of that we cannot read its `location` either — so the proxy
 * injects a tiny reporter that posts navigation up to the parent instead. That
 * is what makes the address bar, Back/Forward, Create Shortcut and Favorites
 * behave like a real browser.
 */

/** Response headers that would break framing or re-impose the origin's policy. */
const STRIPPED_HEADERS = [
    'x-frame-options',
    'content-security-policy',
    'content-security-policy-report-only',
    'cross-origin-opener-policy',
    'cross-origin-embedder-policy',
    'permissions-policy',
    'set-cookie',
    'strict-transport-security',
];

export function should_strip_header(name: string): boolean {
    return STRIPPED_HEADERS.includes(name.toLowerCase());
}

/** `<meta http-equiv="content-security-policy">` does the same job as the header. */
export function strip_csp_meta(html: string): string {
    return html.replace(
        /<meta[^>]+http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi,
        '',
    );
}

/**
 * The reporter. Runs inside the proxied page and:
 *  - announces the page URL on load,
 *  - intercepts link clicks / form GETs and hands the resolved URL to the
 *    parent instead of letting the frame navigate itself away to a
 *    cross-origin page we could no longer track.
 *
 * It is deliberately tiny and dependency-free; the page it runs in is
 * untrusted, so the parent validates everything it receives.
 */
export function reporter_script(
    current_url: string,
    requested_url: string = current_url,
): string {
    const json_url = JSON.stringify(current_url);
    const json_req = JSON.stringify(requested_url);
    return `<script>(function(){
try{
var CUR=${json_url};
var REQ=${json_req};
function post(type,url,requested){try{parent.postMessage({__momadxp:1,type:type,url:url,requested:requested},'*');}catch(e){}}
post('navigated',CUR,REQ);
document.addEventListener('click',function(e){
  var a=e.target&&e.target.closest?e.target.closest('a'):null;
  if(!a)return;
  var href=a.getAttribute('href');
  if(!href||href.charAt(0)==='#')return;
  if(/^(javascript|mailto|tel):/i.test(href))return;
  var abs;try{abs=new URL(href,CUR).toString();}catch(err){return;}
  e.preventDefault();e.stopPropagation();
  post('navigate',abs);
},true);
document.addEventListener('submit',function(e){
  var f=e.target;if(!f||String(f.method||'get').toLowerCase()!=='get')return;
  var abs;try{
    abs=new URL(f.getAttribute('action')||CUR,CUR);
    var fd=new FormData(f);
    fd.forEach(function(v,k){if(typeof v==='string')abs.searchParams.set(k,v);});
  }catch(err){return;}
  e.preventDefault();
  post('navigate',abs.toString());
},true);
}catch(e){}
})();</script>`;
}

/**
 * `<base>` points relative subresources at the ORIGINAL site so images, CSS and
 * scripts load straight from it — they never touch our function, which keeps
 * proxy cost to one invocation per page rather than one per asset.
 */
export function base_tag(current_url: string): string {
    let origin_href: string;
    try {
        origin_href = new URL(current_url).toString();
    } catch {
        return '';
    }
    return `<base href="${escape_attr(origin_href)}">`;
}

function escape_attr(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/** Existing <base> tags would fight ours. */
export function strip_base(html: string): string {
    return html.replace(/<base[^>]*>/gi, '');
}

/**
 * Full document rewrite. Injected as early as possible so the reporter is
 * listening before the page's own scripts can navigate.
 */
/**
 * `current_url` is where the fetch ENDED UP (after redirects) and `requested_url`
 * is what the parent asked for. The reporter announces both, because the parent
 * cannot otherwise tell a redirect of the page it wanted from a stale message
 * sent by a page the user has already navigated away from — and it has to know,
 * since a redirect must REPLACE the current history entry rather than add one.
 */
export function rewrite_document(
    html: string,
    current_url: string,
    requested_url: string = current_url,
): string {
    let out = strip_csp_meta(strip_base(html));
    // <base> stays the FINAL url: relative subresources resolve against where
    // the document actually came from.
    const injection =
        base_tag(current_url) + reporter_script(current_url, requested_url);

    if (/<head[^>]*>/i.test(out)) {
        out = out.replace(/<head[^>]*>/i, (m) => m + injection);
    } else if (/<html[^>]*>/i.test(out)) {
        out = out.replace(/<html[^>]*>/i, (m) => m + injection);
    } else {
        out = injection + out;
    }
    return out;
}
