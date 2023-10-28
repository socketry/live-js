import {Live} from './Live';

let url = new URL('live', location.href);
url.protocol = url.protocol.replace('http', 'ws');

let live = new Live(window, url);

export default live;