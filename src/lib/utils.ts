import mime_db from './mime.json';
import { required } from './types';

interface MimeEntry {
    name: string;
    mime: string;
    ext: string;
}

export function compile_params(
    new_params: Record<string, string | number | null | undefined>,
): string {
    const urlSearchParams = new URLSearchParams(window.location.search);
    const params: Record<string, string | number | null | undefined> =
        Object.fromEntries(urlSearchParams.entries());
    for (const key of Object.keys(new_params)) {
        params[key] = new_params[key];
    }
    return Object.keys(params)
        .filter((key) => params[key] != null)
        .map((key) => `${key}=${String(params[key])}`)
        .join('&')
        .trim();
}

export function is_empty(str: string | null | undefined): boolean {
    return str == null || str.trim().length == 0;
}

export function includes<T>(
    value: T,
    array: readonly { equals: (other: T) => boolean }[] | null | undefined,
): boolean {
    const items = array ?? [];
    return items.some((elm) => elm.equals(value));
}

function parent_match_selector(target: Node | null, selector: string): boolean {
    return [...document.querySelectorAll(selector)].some(
        (el) => el === target || el.contains(target),
    );
}

// usage
// hasParentWithMatchingSelector(myElement, '.some-class-name');

/** Dispatch event on click outside of node */
export function click_outside(node: HTMLElement) {
    const handleClick = (event: MouseEvent) => {
        const target = event.target instanceof Node ? event.target : null;
        if (!node.contains(target) && !event.defaultPrevented) {
            if (parent_match_selector(target, '.context-menu')) return;
            if (parent_match_selector(target, '.toolbar-menu')) return;

            if (parent_match_selector(target, '.tox-tinymce-aux')) return;

            if (
                parent_match_selector(target, '#start-menu-btn') &&
                node == document.querySelector('#start-menu')
            )
                return;

            if (node.classList.contains('window')) {
                const program_id = node.getAttribute('program-id');
                if (program_id) {
                    const selector = `.program-tile[program-id="${program_id}"]`;
                    if (parent_match_selector(target, selector)) return;
                }
            }

            node.dispatchEvent(new CustomEvent('click_outside'));
        }
    };

    document.addEventListener('click', handleClick, true);

    return {
        destroy() {
            document.removeEventListener('click', handleClick, true);
        },
    };
}

export function pick_one<T>(arr: readonly T[]): T | undefined {
    return arr[random_int(0, arr.length - 1)];
}

export function random_int(min: number, max: number): number {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

const system_files = [
    'shells',
    'command',
    'shell',
    'file',
    'and',
    'directory',
    'name',
    'automatic',
    'completion',
    'reference',
    'a-z',
    'powershell',
    'cscript',
    'wscript',
    'debug',
    'system',
    'error',
    'codes',
    'using',
    'redirection',
    'operators',
    'core',
    'virtual',
    'key',
    'reg_dword',
    'active',
    'add',
    'alias',
    'volume',
    'append',
    'arp',
    'assign',
    'assoc',
    'at',
    'atmadm',
    'attach-vdisk',
    'attrib',
    'attributes',
    'disk',
    'auditpol',
    'backup',
    'clear',
    'get',
    'list',
    'remove',
    'resourcesacl',
    'restore',
    'set',
    'autochk',
    'autoconv',
    'autofmt',
    'automount',
    'bcdboot',
    'bcdedit',
    'bdehdcfg',
    'driveinfo',
    'newdriveletter',
    'quiet',
    'restart',
    'size',
    'target',
    'begin',
    'bitsadmin',
    'addfile',
    'addfileset',
    'addfilewithranges',
    'cache',
    'delete',
    'deleteurl',
    'getexpirationtime',
    'getlimit',
    'help',
    'info',
    'setexpirationtime',
    'setlimit',
    'cancel',
    'complete',
    'create',
    'examples',
    'getaclflags',
    'getbytestotal',
    'getbytestransferred',
    'getclientcertificate',
    'getcompletiontime',
    'getcreationtime',
    'getcustomheaders',
    'getdescription',
    'getdisplayname',
    'geterror',
    'geterrorcount',
    'getfilestotal',
    'getfilestransferred',
    'gethelpertokenflags',
    'gethelpertokensid',
    'gethttpmethod',
    'getmaxdownloadtime',
    'getminretrydelay',
    'getmodificationtime',
    'getnoprogresstimeout',
    'getnotifycmdline',
    'getnotifyflags',
    'getnotifyinterface',
    'getowner',
    'getpeercachingflags',
    'getpriority',
    'getproxybypasslist',
    'getproxylist',
    'getproxyusage',
    'getreplydata',
    'getreplyfilename',
    'getreplyprogress',
    'getsecurityflags',
    'getstate',
    'gettemporaryname',
    'gettype',
    'getvalidationstate',
    'listfiles',
    'makecustomheaderswriteonly',
    'monitor',
    'nowrap',
    'peercaching',
    'getconfigurationflags',
    'setconfigurationflags',
    'peers',
    'discover',
    'rawreturn',
    'removeclientcertificate',
    'removecredentials',
    'replaceremoteprefix',
    'reset',
    'resume',
    'setaclflag',
    'setclientcertificatebyid',
    'setclientcertificatebyname',
    'setcredentials',
    'setcustomheaders',
    'setdescription',
    'setdisplayname',
    'sethelpertoken',
    'sethelpertokenflags',
    'sethttpmethod',
    'setmaxdownloadtime',
    'setminretrydelay',
    'setnoprogresstimeout',
    'setnotifycmdline',
    'setnotifyflags',
    'setpeercachingflags',
    'setpriority',
    'setproxysettings',
    'setreplyfilename',
    'setsecurityflags',
    'setvalidationstate',
    'suspend',
    'takeownership',
    'transfer',
    'util',
    'enableanalyticchannel',
    'getieproxy',
    'repairservice',
    'setieproxy',
    'version',
    'wrap',
    'bootcfg',
    'addsw',
    'copy',
    'dbg1394',
    'default',
    'ems',
    'query',
    'raw',
    'rmsw',
    'timeout',
    'break',
    'cacls',
    'call',
    'cd',
    'certreq',
    'certutil',
    'change',
    'logon',
    'port',
    'user',
    'chcp',
    'chdir',
    'chglogon',
    'chgport',
    'chgusr',
    'chkdsk',
    'chkntfs',
    'choice',
    'cipher',
    'clean',
    'cleanmgr',
    'clip',
    'cls',
    'cmd',
    'cmdkey',
    'cmstp',
    'color',
    'comp',
    'compact',
    'vdisk',
    'convert',
    'basic',
    'dynamic',
    'gpt',
    'mbr',
    'cprofile',
    'partition',
    'efi',
    'extended',
    'logical',
    'msr',
    'primary',
    'mirror',
    'raid',
    'simple',
    'stripe',
    'date',
    'dcgpofix',
    'defrag',
    'del',
    'shadows',
    'detach',
    'detail',
    'dfsdiag',
    'testdcs',
    'testdfsconfig',
    'testdfsintegrity',
    'testreferral',
    'testsites',
    'dfsrmig',
    'diantz',
    'dir',
    'diskcomp',
    'diskcopy',
    'diskpart',
    'diskperf',
    'diskraid',
    'diskshadow',
    'dispdiag',
    'dnscmd',
    'doskey',
    'driverquery',
    'echo',
    'edit',
    'endlocal',
    'end',
    'erase',
    'eventcreate',
    'eventquery',
    'eventtriggers',
    'evntcmd',
    'exec',
    'exit',
    'expand',
    'expose',
    'extend',
    'extract',
    'fc',
    'filesystems',
    'find',
    'findstr',
    'finger',
    'flattemp',
    'fondue',
    'for',
    'forfiles',
    'format',
    'freedisk',
    'fsutil',
    '8dot3name',
    'behavior',
    'dirty',
    'fsinfo',
    'hardlink',
    'objectid',
    'quota',
    'repair',
    'reparsepoint',
    'resource',
    'sparse',
    'tiering',
    'transaction',
    'usn',
    'wim',
    'ftp',
    'ascii',
    'bell',
    'binary',
    'bye',
    'close',
    'disconnect',
    'glob',
    'hash',
    'lcd',
    'literal',
    'ls',
    'mget',
    'mkdir',
    'mls',
    'mput',
    'open',
    'prompt',
    'put',
    'pwd',
    'quit',
    'quote',
    'recv',
    'remotehelp',
    'rename',
    'rmdir',
    'send',
    'status',
    'trace',
    'type',
    'verbose',
    'mdelete',
    'mdir',
    'ftype',
    'fveupdate',
    'getmac',
    'goto',
    'gpfixup',
    'gpresult',
    'gpupdate',
    'graftabl',
    'helpctr',
    'hostname',
    'icacls',
    'if',
    'import',
    '(shadowdisk)',
    '(diskpart)',
    'inactive',
    'inuse',
    'ipconfig',
    'ipxroute',
    'irftp',
    'jetpack',
    'klist',
    'ksetup',
    'addenctypeattr',
    'addhosttorealmmap',
    'addkdc',
    'addkpasswd',
    'addrealmflags',
    'changepassword',
    'delenctypeattr',
    'delhosttorealmmap',
    'delkdc',
    'delkpasswd',
    'delrealmflags',
    'domain',
    'dumpstate',
    'getenctypeattr',
    'listrealmflags',
    'mapuser',
    'removerealm',
    'server',
    'setcomputerpassword',
    'setenctypeattr',
    'setrealm',
    'setrealmflags',
    'ktmutil',
    'ktpass',
    'label',
    'providers',
    'writers',
    'load',
    'metadata',
    'lodctr',
    'logman',
    'alert',
    'api',
    'cfg',
    'counter',
    'export',
    'start',
    'stop',
    'update',
    'logoff',
    'lpq',
    'lpr',
    'macfile',
    'makecab',
    'manage',
    'bde',
    'on',
    'off',
    'pause',
    'lock',
    'unlock',
    'autounlock',
    'protectors',
    'tpm',
    'setidentifier',
    'forcerecovery',
    'changepin',
    'changekey',
    'keypackage',
    'upgrade',
    'wipefreespace',
    'mapadmin',
    'md',
    'merge',
    'mklink',
    'mmc',
    'mode',
    'more',
    'mount',
    'mountvol',
    'move',
    'mqbkup',
    'mqsvc',
    'mqtgsvc',
    'msdt',
    'msg',
    'msiexec',
    'msinfo32',
    'mstsc',
    'nbtstat',
    'netcfg',
    'netdom',
    'net',
    'print',
    'netsh',
    'netstat',
    'nfsadmin',
    'nfsshare',
    'nfsstat',
    'nlbmgr',
    'nltest',
    'nslookup',
    'lserver',
    'root',
    'all',
    'class',
    'd2',
    'querytype',
    'recurse',
    'retry',
    'search',
    'srchlist',
    'vc',
    'view',
    'ntbackup',
    'ntcmdprompt',
    'ntfrsutl',
    'offline',
    'online',
    'openfiles',
    'pagefileconfig',
    'path',
    'pathping',
    'pbadmin',
    'pentnt',
    'perfmon',
    'ping',
    'pktmon',
    'pnpunattend',
    'pnputil',
    'popd',
    'ise',
    'prncnfg',
    'prndrvr',
    'prnjobs',
    'prnmngr',
    'prnport',
    'prnqctl',
    'pubprn',
    'pushd',
    'pushprinterconnections',
    'pwlauncher',
    'pwsh',
    'qappsrv',
    'qprocess',
    'process',
    'session',
    'termserver',
    'quser',
    'qwinsta',
    'rcp',
    'rd',
    'rdpsign',
    'recover',
    'group',
    'refsutil',
    'reg',
    'compare',
    'save',
    'unload',
    'regini',
    'regsvr32',
    'relog',
    'rem',
    'ren',
    'repadmin',
    'replace',
    'rescan',
    'retain',
    'revert',
    'rexec',
    'risetup',
    'robocopy',
    'route',
    'ws2008',
    'rpcinfo',
    'rpcping',
    'rsh',
    'rundll32',
    'printui',
    'rwinsta',
    'san',
    'sc',
    'config',
    'schtasks',
    'scwcmd',
    'analyze',
    'configure',
    'register',
    'rollback',
    'transform',
    'secedit',
    'generaterollback',
    'validate',
    'select',
    'serverceipoptin',
    'servermanagercmd',
    'serverweroptin',
    'environmental',
    'variables',
    'shadow',
    'context',
    'id',
    'setlocal',
    'option',
    'setx',
    'sfc',
    'shift',
    'showmount',
    'shrink',
    'shutdown',
    'simulate',
    'sort',
    'subcommand',
    'device',
    'drivergroup',
    'drivergroupfilter',
    'driverpackage',
    'image',
    'imagegroup',
    'transportserver',
    'multicasttransmission',
    'namespace',
    'subst',
    'sxstrace',
    'sysocmgr',
    'systeminfo',
    'takeown',
    'tapicfg',
    'taskkill',
    'tasklist',
    'tcmsetup',
    'telnet',
    'display',
    'unset',
    'tftp',
    'time',
    'title',
    'tlntadmn',
    'tpmtool',
    'tpmvscmgr',
    'tracerpt',
    'tracert',
    'tree',
    'tscon',
    'tsdiscon',
    'tsecimp',
    'tskill',
    'tsprof',
    'typeperf',
    'tzutil',
    'unexpose',
    'uniqueid',
    'unlodctr',
    'ver',
    'verifier',
    'verify',
    'vol',
    'vssadmin',
    'resize',
    'shadowstorage',
    'waitfor',
    'wbadmin',
    'catalog',
    'systemstatebackup',
    'disable',
    'enable',
    'disks',
    'items',
    'versions',
    'recovery',
    'sysrecovery',
    'systemstaterecovery',
    'job',
    'wdsutil',
    'wecutil',
    'wevtutil',
    'where',
    'whoami',
    'winnt',
    'winnt32',
    'winpop',
    'winrs',
    'winsat',
    'mem',
    'mfmedia',
    'wmic',
    'writer',
    'xcopy',
];

export function random_files(): string {
    return (
        (pick_one(system_files) ?? '') +
        '.' +
        (pick_one(['dll', 'icm', 'sys', 'inf', 'bin', 'exe']) ?? '')
    );
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

export function parse_bool(value: string | null | undefined): boolean {
    let parsed: unknown;
    try {
        parsed = JSON.parse(value ?? 'false');
    } catch {
        parsed = false;
    }
    if (typeof parsed == 'boolean') {
        return parsed;
    } else {
        return false;
    }
}

export function set_theme(theme = 'xp'): void {
    const theme_link = required(
        document.querySelector<HTMLLinkElement>('#theme'),
        '#theme link element',
    );
    if (theme == 'xp') {
        theme_link.href = 'https://unpkg.com/xp.css';
    } else if (theme == 'none') {
        theme_link.href = '';
    }
}

/**
 * JSON round-trip clone. Returns `unknown` because JSON serialization does
 * not preserve the input type (Dates become strings, functions are dropped);
 * callers narrow at the boundary.
 */
export function clone(obj: unknown): unknown {
    const parsed: unknown = JSON.parse(JSON.stringify(obj));
    return parsed;
}

interface RectEdges {
    top: number;
    left: number;
    right: number;
    bottom: number;
}

export function relative_rect(parent: RectEdges, child: RectEdges): RectEdges {
    return {
        top: child.top - parent.top,
        left: child.left - parent.left,
        right: parent.right - child.right,
        bottom: parent.bottom - child.bottom,
    };
}

export function format_time(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.round(seconds % 60);
    return [
        h,
        m > 9 ? m : h ? '0' + String(m) : m || '0',
        s > 9 ? s : '0' + String(s),
    ]
        .filter(Boolean)
        .join(':');
}

export function extname(path: string): string {
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    // Track the state of characters (if any) we see before our first dot and
    // after any path separator we find
    let preDotState = 0;
    for (let i = path.length - 1; i >= 0; --i) {
        const code = path.charCodeAt(i);
        if (code === 47 /*/*/) {
            // If we reached a path separator that was not part of a set of path
            // separators at the end of the string, stop now
            if (!matchedSlash) {
                startPart = i + 1;
                break;
            }
            continue;
        }
        if (end === -1) {
            // We saw the first non-path separator, mark this as the end of our
            // extension
            matchedSlash = false;
            end = i + 1;
        }
        if (code === 46 /*.*/) {
            // If this is our first dot, mark it as the start of our extension
            if (startDot === -1) startDot = i;
            else if (preDotState !== 1) preDotState = 1;
        } else if (startDot !== -1) {
            // We saw a non-dot and non-path separator before our dot, so we should
            // have a good chance at having a non-empty extension
            preDotState = -1;
        }
    }

    if (
        startDot === -1 ||
        end === -1 ||
        // We saw a non-dot character immediately before the dot
        preDotState === 0 ||
        // The (right-most) trimmed path component is exactly '..'
        (preDotState === 1 &&
            startDot === end - 1 &&
            startDot === startPart + 1)
    ) {
        return '';
    }
    return path.slice(startDot, end);
}

export function basename(path: string, ext?: unknown): string {
    if (ext !== undefined && typeof ext !== 'string')
        throw new TypeError('"ext" argument must be a string');

    let start = 0;
    let end = -1;
    let matchedSlash = true;
    let i;

    if (ext !== undefined && ext.length > 0 && ext.length <= path.length) {
        if (ext.length === path.length && ext === path) return '';
        let extIdx = ext.length - 1;
        let firstNonSlashEnd = -1;
        for (i = path.length - 1; i >= 0; --i) {
            const code = path.charCodeAt(i);
            if (code === 47 /*/*/) {
                // If we reached a path separator that was not part of a set of path
                // separators at the end of the string, stop now
                if (!matchedSlash) {
                    start = i + 1;
                    break;
                }
            } else {
                if (firstNonSlashEnd === -1) {
                    // We saw the first non-path separator, remember this index in case
                    // we need it if the extension ends up not matching
                    matchedSlash = false;
                    firstNonSlashEnd = i + 1;
                }
                if (extIdx >= 0) {
                    // Try to match the explicit extension
                    if (code === ext.charCodeAt(extIdx)) {
                        if (--extIdx === -1) {
                            // We matched the extension, so mark this as the end of our path
                            // component
                            end = i;
                        }
                    } else {
                        // Extension does not match, so our result is the entire path
                        // component
                        extIdx = -1;
                        end = firstNonSlashEnd;
                    }
                }
            }
        }

        if (start === end) end = firstNonSlashEnd;
        else if (end === -1) end = path.length;
        return path.slice(start, end);
    } else {
        for (i = path.length - 1; i >= 0; --i) {
            if (path.charCodeAt(i) === 47 /*/*/) {
                // If we reached a path separator that was not part of a set of path
                // separators at the end of the string, stop now
                if (!matchedSlash) {
                    start = i + 1;
                    break;
                }
            } else if (end === -1) {
                // We saw the first non-path separator, mark this as the end of our
                // path component
                matchedSlash = false;
                end = i + 1;
            }
        }

        if (end === -1) return '';
        return path.slice(start, end);
    }
}

export function formatBytes(bytes: number, decimals = 2): string {
    if (!bytes) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${String(parseFloat((bytes / Math.pow(k, i)).toFixed(dm)))} ${sizes[i] ?? ''}`;
}

export function ext_to_mime(
    name: string | null | undefined,
    default_mime: string | null = null,
): string | null {
    if (name == null) return default_mime;
    name = 'something' + name;
    const ext = extname(name);
    const type = mime_db.find((el) => el.ext == ext);

    if (type != null) {
        return type.mime;
    } else {
        return default_mime;
    }
}

export function get_filetype(file: {
    name?: string;
    type?: string;
}): MimeEntry {
    const type = mime_db.find((el) => el.mime == file.type);
    if (type == null) {
        return {
            ext: extname(file.name || '_.txt'),
            name:
                (file.type || 'text/plain') +
                ` (${extname(file.name || '_.txt')})`,
            mime: file.type || 'text/plain',
        };
    } else {
        return type;
    }
}

export function data_url_to_blob(dataURI: string): Blob {
    // convert base64 to raw binary data held in a string
    // doesn't handle URLEncoded DataURIs - see SO answer #6850276 for code that does this
    const byteString = atob(
        required(dataURI.split(',')[1], 'data url payload'),
    ); //Buffer.from(dataURI, 'base64');

    // separate out the mime component
    const mimeString =
        required(
            (dataURI.split(',')[0] ?? '').split(':')[1],
            'data url mime',
        ).split(';')[0] ?? '';

    // write the bytes of the string to an ArrayBuffer
    const ab = new ArrayBuffer(byteString.length);

    // create a view into the buffer
    const ia = new Uint8Array(ab);

    // set the bytes of the buffer to the correct values
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }

    // write the ArrayBuffer to a blob, and you're done
    const blob = new Blob([ab], { type: mimeString });
    return blob;
}

export function sanitize_filename(name: string): string {
    return name.split('\\').join('').split('/').join('');
}

export function browser_window(): Window {
    return window;
}

export function timestamp_to_readable(timestamp: number): string {
    const date = new Date();
    date.setTime(timestamp);
    return date.toString();
}

/** Svelte action: fires 'double_tap' custom event on two taps within 300ms.
 *  Resets on 'long_press' events to avoid false triggers after a long press.
 *  Usage: <div use:double_tap on:double_tap={() => handler()}>
 */
export function double_tap(node: HTMLElement) {
    let lastTap = 0;

    function handle() {
        const now = Date.now();
        const diff = now - lastTap;
        if (diff < 300 && diff > 0) {
            node.dispatchEvent(
                new CustomEvent('double_tap', { bubbles: true }),
            );
            lastTap = 0;
        } else {
            lastTap = now;
        }
    }

    function reset() {
        lastTap = 0;
    }

    // passive: true — don't call preventDefault so iOS doesn't redirect
    // subsequent touches to the parent element
    node.addEventListener('touchend', handle, { passive: true });
    node.addEventListener('long_press', reset);

    return {
        destroy() {
            node.removeEventListener('touchend', handle);
            node.removeEventListener('long_press', reset);
        },
    };
}

/** Svelte action: fires 'long_press' custom event after holding touch for `duration` ms.
 *  Cancels if the finger moves more than 10px.
 *  Usage: <div use:long_press on:long_press={(e) => handler(e.detail.x, e.detail.y)}>
 */
export function long_press(node: HTMLElement, duration = 500) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let startX = 0;
    let startY = 0;

    function handle_start(e: TouchEvent) {
        if (e.touches.length > 1) return;
        const t = e.touches[0];
        if (t == null) return;
        startX = t.clientX;
        startY = t.clientY;
        timer = setTimeout(() => {
            node.dispatchEvent(
                new CustomEvent('long_press', {
                    detail: { x: startX, y: startY },
                    bubbles: true,
                }),
            );
        }, duration);
    }

    function handle_move(e: TouchEvent) {
        if (!timer) return;
        const t = e.touches[0];
        if (t == null) return;
        if (
            Math.abs(t.clientX - startX) > 10 ||
            Math.abs(t.clientY - startY) > 10
        ) {
            clearTimeout(timer);
            timer = null;
        }
    }

    function handle_end() {
        if (timer != null) clearTimeout(timer);
        timer = null;
    }

    node.addEventListener('touchstart', handle_start, { passive: true });
    node.addEventListener('touchmove', handle_move, { passive: true });
    node.addEventListener('touchend', handle_end);
    node.addEventListener('touchcancel', handle_end);

    return {
        destroy() {
            if (timer != null) clearTimeout(timer);
            node.removeEventListener('touchstart', handle_start);
            node.removeEventListener('touchmove', handle_move);
            node.removeEventListener('touchend', handle_end);
            node.removeEventListener('touchcancel', handle_end);
        },
    };
}

/**
 * The part of a KeyboardEvent this helper actually needs. Structural rather
 * than `KeyboardEvent` so it is testable under the node environment, and so a
 * caller cannot be surprised by which fields are read.
 */
export interface ActivationKey {
    key: string;
    preventDefault: () => void;
}

/**
 * Keyboard activation for a list row that is a `role="button"` div.
 *
 * Four panels shipped `on:keydown={() => {}}` — an empty handler that silences
 * the a11y lint while leaving the row focusable, announced as a control, and
 * completely inert. This makes Enter and Space actually do what the click does.
 */
export function activate(fn: () => void): (e: ActivationKey) => void {
    return (e: ActivationKey) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        fn();
    };
}
