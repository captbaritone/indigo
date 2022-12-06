/**
 * Utility functions for encoding numeric types.
 *
 * This type of bit twiddling is not my strong suit, so most of this code is
 * borrowed from other libraries.
 */

// Copied from https://github.com/feross/ieee754/blob/master/index.js
export function appendF64(buffer: number[], value: number) {
  // Originally these four were arguments, but we only ever use it like this.
  const offset = buffer.length;
  const isLE = true;
  let mLen = 52;
  const nBytes = 8;

  var e, m, c;
  var eLen = nBytes * 8 - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var rt = mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0;
  var i = isLE ? 0 : nBytes - 1;
  var d = isLE ? 1 : -1;
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (
    ;
    mLen >= 8;
    buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8
  ) {}

  e = (e << mLen) | m;
  eLen += mLen;
  for (
    ;
    eLen > 0;
    buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8
  ) {}

  buffer[offset + i - d] |= s * 128;
}

export function appendU32(buffer: number[], n: number) {
  do {
    let byte = n & 0x7f;
    n >>>= 7;
    if (n !== 0) {
      byte |= 0x80;
    }
    buffer.push(byte);
  } while (n !== 0);
}

export function appendI32(buffer: number[], value: number) {
  // TODO: Guard
  let byte = 0x00;
  let size = Math.ceil(Math.log2(Math.abs(value)));
  let negative = value < 0;
  let more = true;

  while (more) {
    byte = value & 127;
    value = value >> 7;

    if (negative) {
      value = value | -(1 << (size - 7));
    }

    if (
      (value == 0 && (byte & 0x40) == 0) ||
      (value == -1 && (byte & 0x40) == 0x40)
    ) {
      more = false;
    } else {
      byte = byte | 128;
    }

    buffer.push(byte);
  }
}
