(function attachQrEngine(global) {
  "use strict";

  const ERROR_LEVELS = {
    L: { index: 0, formatBits: 1, label: "Compact" },
    M: { index: 1, formatBits: 0, label: "Medium" },
    Q: { index: 2, formatBits: 3, label: "Quality" },
    H: { index: 3, formatBits: 2, label: "High" },
  };

  const TOTAL_CODEWORDS = [
    0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581,
    655, 733, 815, 901, 991, 1085, 1156, 1258, 1364, 1474, 1588, 1706,
    1828, 1921, 2051, 2185, 2323, 2465, 2611, 2761, 2876, 3034, 3196,
    3362, 3532, 3706,
  ];

  const ECC_CODEWORDS_PER_BLOCK = [
    null,
    [7, 10, 13, 17],
    [10, 16, 22, 28],
    [15, 26, 18, 22],
    [20, 18, 26, 16],
    [26, 24, 18, 22],
    [18, 16, 24, 28],
    [20, 18, 18, 26],
    [24, 22, 22, 26],
    [30, 22, 20, 24],
    [18, 26, 24, 28],
    [20, 30, 28, 24],
    [24, 22, 26, 28],
    [26, 22, 24, 22],
    [30, 24, 20, 24],
    [22, 24, 30, 24],
    [24, 28, 24, 30],
    [28, 28, 28, 28],
    [30, 26, 28, 28],
    [28, 26, 26, 26],
    [28, 26, 30, 28],
    [28, 26, 28, 30],
    [28, 28, 30, 24],
    [30, 28, 30, 30],
    [30, 28, 30, 30],
    [26, 28, 30, 30],
    [28, 28, 28, 30],
    [30, 28, 30, 30],
    [30, 28, 30, 30],
    [30, 28, 30, 30],
    [30, 28, 30, 30],
    [30, 28, 30, 30],
    [30, 28, 30, 30],
    [30, 28, 30, 30],
    [30, 28, 30, 30],
    [30, 28, 30, 30],
    [30, 28, 30, 30],
    [30, 28, 30, 30],
    [30, 28, 30, 30],
    [30, 28, 30, 30],
    [30, 28, 30, 30],
  ];

  const NUM_ERROR_CORRECTION_BLOCKS = [
    null,
    [1, 1, 1, 1],
    [1, 1, 1, 1],
    [1, 1, 2, 2],
    [1, 2, 2, 4],
    [1, 2, 4, 4],
    [2, 4, 4, 4],
    [2, 4, 6, 5],
    [2, 4, 6, 6],
    [2, 5, 8, 8],
    [4, 5, 8, 8],
    [4, 5, 8, 11],
    [4, 8, 10, 11],
    [4, 9, 12, 16],
    [4, 9, 16, 16],
    [6, 10, 12, 18],
    [6, 10, 17, 16],
    [6, 11, 16, 19],
    [6, 13, 18, 21],
    [7, 14, 21, 25],
    [8, 16, 20, 25],
    [8, 17, 23, 25],
    [9, 17, 23, 34],
    [9, 18, 25, 30],
    [10, 20, 27, 32],
    [12, 21, 29, 35],
    [12, 23, 34, 37],
    [12, 25, 34, 40],
    [13, 26, 35, 42],
    [14, 28, 38, 45],
    [15, 29, 40, 48],
    [16, 31, 43, 51],
    [17, 33, 45, 54],
    [18, 35, 48, 57],
    [19, 37, 51, 60],
    [19, 38, 53, 63],
    [20, 40, 56, 66],
    [21, 43, 59, 70],
    [22, 45, 62, 74],
    [24, 47, 65, 77],
    [25, 49, 68, 81],
  ];

  const GF_EXP = new Array(512);
  const GF_LOG = new Array(256);
  let gfValue = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = gfValue;
    GF_LOG[gfValue] = i;
    gfValue <<= 1;
    if (gfValue & 0x100) {
      gfValue ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i += 1) {
    GF_EXP[i] = GF_EXP[i - 255];
  }

  function encode(text, options) {
    const input = String(text);
    const bytes = new TextEncoder().encode(input);
    const preference = (options && options.errorLevel) || "AUTO";
    const choice = chooseVersionAndErrorLevel(bytes, preference);
    const dataCodewords = makeDataCodewords(bytes, choice.version, choice.level);
    const allCodewords = addErrorCorrection(dataCodewords, choice.version, choice.level);
    const base = makeBaseMatrix(choice.version, choice.level);
    drawCodewords(base, allCodewords);

    let bestMatrix = null;
    let bestMask = 0;
    let bestPenalty = Infinity;

    for (let mask = 0; mask < 8; mask += 1) {
      const candidate = cloneMatrix(base);
      applyMask(candidate, mask);
      drawFormatBits(candidate, choice.level, mask);
      const penalty = getPenaltyScore(candidate.modules);
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        bestMask = mask;
        bestMatrix = candidate;
      }
    }

    return {
      text: input,
      bytes: Array.from(bytes),
      byteLength: bytes.length,
      version: choice.version,
      errorLevel: choice.level,
      errorLabel: ERROR_LEVELS[choice.level].label,
      size: bestMatrix.size,
      modules: bestMatrix.modules.map((row) => row.slice()),
      mask: bestMask,
      dataCodewords: getNumDataCodewords(choice.version, choice.level),
      capacityBytes: getByteCapacity(choice.version, choice.level),
      penalty: bestPenalty,
    };
  }

  function chooseVersionAndErrorLevel(bytes, preference) {
    if (preference !== "AUTO") {
      const level = ERROR_LEVELS[preference] ? preference : "M";
      const version = findMinimumVersion(bytes, level);
      if (!version) {
        throw new RangeError(`Payload is too large for ${ERROR_LEVELS[level].label} correction.`);
      }
      return { version, level };
    }

    const balancedVersion = findMinimumVersion(bytes, "M");
    const compactVersion = balancedVersion || findMinimumVersion(bytes, "L");
    if (!compactVersion) {
      throw new RangeError("Payload is too large for a QR code.");
    }

    for (const level of ["H", "Q", "M", "L"]) {
      if (canEncode(bytes, compactVersion, level)) {
        return { version: compactVersion, level };
      }
    }

    return { version: compactVersion, level: "L" };
  }

  function findMinimumVersion(bytes, level) {
    for (let version = 1; version <= 40; version += 1) {
      if (canEncode(bytes, version, level)) {
        return version;
      }
    }
    return null;
  }

  function canEncode(bytes, version, level) {
    const neededBits = 4 + getByteModeCharCountBits(version) + bytes.length * 8;
    return neededBits <= getNumDataCodewords(version, level) * 8;
  }

  function getByteModeCharCountBits(version) {
    return version < 10 ? 8 : 16;
  }

  function getNumDataCodewords(version, level) {
    const index = ERROR_LEVELS[level].index;
    return (
      TOTAL_CODEWORDS[version] -
      ECC_CODEWORDS_PER_BLOCK[version][index] * NUM_ERROR_CORRECTION_BLOCKS[version][index]
    );
  }

  function getByteCapacity(version, level) {
    const availableBits = getNumDataCodewords(version, level) * 8;
    const overheadBits = 4 + getByteModeCharCountBits(version);
    return Math.max(0, Math.floor((availableBits - overheadBits) / 8));
  }

  function makeDataCodewords(bytes, version, level) {
    const dataCapacityBits = getNumDataCodewords(version, level) * 8;
    const bits = [];
    appendBits(bits, 0x4, 4);
    appendBits(bits, bytes.length, getByteModeCharCountBits(version));

    for (const byte of bytes) {
      appendBits(bits, byte, 8);
    }

    const terminatorLength = Math.min(4, dataCapacityBits - bits.length);
    appendBits(bits, 0, terminatorLength);

    while (bits.length % 8 !== 0) {
      bits.push(0);
    }

    const result = [];
    for (let i = 0; i < bits.length; i += 8) {
      result.push(bitsToByte(bits, i));
    }

    for (let padByte = 0xec; result.length < getNumDataCodewords(version, level); padByte ^= 0xfd) {
      result.push(padByte);
    }

    return result;
  }

  function appendBits(bits, value, length) {
    if (length < 0 || length > 31 || value >>> length !== 0) {
      throw new RangeError("Value does not fit in bit length.");
    }
    for (let i = length - 1; i >= 0; i -= 1) {
      bits.push((value >>> i) & 1);
    }
  }

  function bitsToByte(bits, offset) {
    let value = 0;
    for (let i = 0; i < 8; i += 1) {
      value = (value << 1) | bits[offset + i];
    }
    return value;
  }

  function addErrorCorrection(dataCodewords, version, level) {
    const index = ERROR_LEVELS[level].index;
    const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[version][index];
    const blockEccLen = ECC_CODEWORDS_PER_BLOCK[version][index];
    const rawCodewords = TOTAL_CODEWORDS[version];
    const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
    const shortBlockLen = Math.floor(rawCodewords / numBlocks);
    const divisor = reedSolomonComputeDivisor(blockEccLen);
    const blocks = [];
    let offset = 0;

    for (let block = 0; block < numBlocks; block += 1) {
      const dataLength = shortBlockLen - blockEccLen + (block < numShortBlocks ? 0 : 1);
      const data = dataCodewords.slice(offset, offset + dataLength);
      offset += dataLength;
      const ecc = reedSolomonComputeRemainder(data, divisor);
      if (block < numShortBlocks) {
        data.push(0);
      }
      blocks.push(data.concat(ecc));
    }

    const result = [];
    for (let i = 0; i < blocks[0].length; i += 1) {
      for (let block = 0; block < blocks.length; block += 1) {
        if (i !== shortBlockLen - blockEccLen || block >= numShortBlocks) {
          result.push(blocks[block][i]);
        }
      }
    }

    if (result.length !== rawCodewords) {
      throw new Error("QR codeword interleaving failed.");
    }

    return result;
  }

  function reedSolomonComputeDivisor(degree) {
    const result = new Array(degree).fill(0);
    result[degree - 1] = 1;
    let root = 1;

    for (let i = 0; i < degree; i += 1) {
      for (let j = 0; j < result.length; j += 1) {
        result[j] = gfMultiply(result[j], root);
        if (j + 1 < result.length) {
          result[j] ^= result[j + 1];
        }
      }
      root = gfMultiply(root, 0x02);
    }

    return result;
  }

  function reedSolomonComputeRemainder(data, divisor) {
    const result = new Array(divisor.length).fill(0);

    for (const byte of data) {
      const factor = byte ^ result.shift();
      result.push(0);
      for (let i = 0; i < result.length; i += 1) {
        result[i] ^= gfMultiply(divisor[i], factor);
      }
    }

    return result;
  }

  function gfMultiply(left, right) {
    if (left === 0 || right === 0) {
      return 0;
    }
    return GF_EXP[GF_LOG[left] + GF_LOG[right]];
  }

  function makeBaseMatrix(version, level) {
    const size = version * 4 + 17;
    const matrix = {
      version,
      size,
      modules: Array.from({ length: size }, () => Array(size).fill(false)),
      isFunction: Array.from({ length: size }, () => Array(size).fill(false)),
    };

    drawFinderPattern(matrix, 3, 3);
    drawFinderPattern(matrix, size - 4, 3);
    drawFinderPattern(matrix, 3, size - 4);
    drawAlignmentPatterns(matrix);
    drawTimingPatterns(matrix);
    drawFormatBits(matrix, level, 0);
    drawVersionBits(matrix);
    setFunctionModule(matrix, 8, size - 8, true);

    return matrix;
  }

  function cloneMatrix(matrix) {
    return {
      version: matrix.version,
      size: matrix.size,
      modules: matrix.modules.map((row) => row.slice()),
      isFunction: matrix.isFunction.map((row) => row.slice()),
    };
  }

  function setFunctionModule(matrix, x, y, isDark) {
    matrix.modules[y][x] = Boolean(isDark);
    matrix.isFunction[y][x] = true;
  }

  function drawFinderPattern(matrix, centerX, centerY) {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const x = centerX + dx;
        const y = centerY + dy;
        if (x < 0 || y < 0 || x >= matrix.size || y >= matrix.size) {
          continue;
        }
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        setFunctionModule(matrix, x, y, distance !== 2 && distance !== 4);
      }
    }
  }

  function drawAlignmentPatterns(matrix) {
    const positions = getAlignmentPatternPositions(matrix.version);
    for (const y of positions) {
      for (const x of positions) {
        const overlapsFinder =
          (x === 6 && y === 6) ||
          (x === 6 && y === matrix.size - 7) ||
          (x === matrix.size - 7 && y === 6);
        if (!overlapsFinder) {
          drawAlignmentPattern(matrix, x, y);
        }
      }
    }
  }

  function getAlignmentPatternPositions(version) {
    if (version === 1) {
      return [];
    }
    const size = version * 4 + 17;
    const count = Math.floor(version / 7) + 2;
    const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
    const result = [6];
    for (let position = size - 7; result.length < count; position -= step) {
      result.splice(1, 0, position);
    }
    return result;
  }

  function drawAlignmentPattern(matrix, centerX, centerY) {
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        setFunctionModule(matrix, centerX + dx, centerY + dy, distance !== 1);
      }
    }
  }

  function drawTimingPatterns(matrix) {
    for (let i = 8; i < matrix.size - 8; i += 1) {
      const isDark = i % 2 === 0;
      setFunctionModule(matrix, 6, i, isDark);
      setFunctionModule(matrix, i, 6, isDark);
    }
  }

  function drawVersionBits(matrix) {
    if (matrix.version < 7) {
      return;
    }

    let remainder = matrix.version;
    for (let i = 0; i < 12; i += 1) {
      remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
    }
    const bits = (matrix.version << 12) | remainder;

    for (let i = 0; i < 18; i += 1) {
      const bit = getBit(bits, i);
      const a = matrix.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunctionModule(matrix, a, b, bit);
      setFunctionModule(matrix, b, a, bit);
    }
  }

  function drawFormatBits(matrix, level, mask) {
    const data = (ERROR_LEVELS[level].formatBits << 3) | mask;
    let remainder = data;
    for (let i = 0; i < 10; i += 1) {
      remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
    }
    const bits = ((data << 10) | remainder) ^ 0x5412;

    for (let i = 0; i <= 5; i += 1) {
      setFunctionModule(matrix, 8, i, getBit(bits, i));
    }
    setFunctionModule(matrix, 8, 7, getBit(bits, 6));
    setFunctionModule(matrix, 8, 8, getBit(bits, 7));
    setFunctionModule(matrix, 7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i += 1) {
      setFunctionModule(matrix, 14 - i, 8, getBit(bits, i));
    }

    for (let i = 0; i < 8; i += 1) {
      setFunctionModule(matrix, matrix.size - 1 - i, 8, getBit(bits, i));
    }
    for (let i = 8; i < 15; i += 1) {
      setFunctionModule(matrix, 8, matrix.size - 15 + i, getBit(bits, i));
    }
    setFunctionModule(matrix, 8, matrix.size - 8, true);
  }

  function drawCodewords(matrix, data) {
    let bitIndex = 0;
    for (let right = matrix.size - 1; right >= 1; right -= 2) {
      if (right === 6) {
        right -= 1;
      }

      for (let vertical = 0; vertical < matrix.size; vertical += 1) {
        for (let column = 0; column < 2; column += 1) {
          const x = right - column;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? matrix.size - 1 - vertical : vertical;

          if (!matrix.isFunction[y][x] && bitIndex < data.length * 8) {
            matrix.modules[y][x] = getBit(data[Math.floor(bitIndex / 8)], 7 - (bitIndex % 8));
            bitIndex += 1;
          }
        }
      }
    }
  }

  function applyMask(matrix, mask) {
    for (let y = 0; y < matrix.size; y += 1) {
      for (let x = 0; x < matrix.size; x += 1) {
        if (!matrix.isFunction[y][x] && getMaskBit(mask, x, y)) {
          matrix.modules[y][x] = !matrix.modules[y][x];
        }
      }
    }
  }

  function getMaskBit(mask, x, y) {
    switch (mask) {
      case 0:
        return (x + y) % 2 === 0;
      case 1:
        return y % 2 === 0;
      case 2:
        return x % 3 === 0;
      case 3:
        return (x + y) % 3 === 0;
      case 4:
        return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
      case 5:
        return ((x * y) % 2) + ((x * y) % 3) === 0;
      case 6:
        return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
      case 7:
        return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
      default:
        throw new RangeError("Invalid QR mask.");
    }
  }

  function getPenaltyScore(modules) {
    const size = modules.length;
    let score = 0;

    for (let y = 0; y < size; y += 1) {
      score += getLinePenalty(modules[y]);
    }

    for (let x = 0; x < size; x += 1) {
      const column = [];
      for (let y = 0; y < size; y += 1) {
        column.push(modules[y][x]);
      }
      score += getLinePenalty(column);
    }

    for (let y = 0; y < size - 1; y += 1) {
      for (let x = 0; x < size - 1; x += 1) {
        const color = modules[y][x];
        if (
          color === modules[y][x + 1] &&
          color === modules[y + 1][x] &&
          color === modules[y + 1][x + 1]
        ) {
          score += 3;
        }
      }
    }

    let dark = 0;
    for (const row of modules) {
      for (const module of row) {
        if (module) {
          dark += 1;
        }
      }
    }

    const total = size * size;
    const balancePenalty = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    return score + balancePenalty * 10;
  }

  function getLinePenalty(line) {
    let score = 0;
    let runColor = line[0];
    let runLength = 1;

    for (let i = 1; i < line.length; i += 1) {
      if (line[i] === runColor) {
        runLength += 1;
        if (runLength === 5) {
          score += 3;
        } else if (runLength > 5) {
          score += 1;
        }
      } else {
        runColor = line[i];
        runLength = 1;
      }
    }

    for (let i = 0; i <= line.length - 11; i += 1) {
      if (
        line[i] &&
        !line[i + 1] &&
        line[i + 2] &&
        line[i + 3] &&
        line[i + 4] &&
        !line[i + 5] &&
        line[i + 6] &&
        !line[i + 7] &&
        !line[i + 8] &&
        !line[i + 9] &&
        !line[i + 10]
      ) {
        score += 40;
      }
      if (
        !line[i] &&
        !line[i + 1] &&
        !line[i + 2] &&
        !line[i + 3] &&
        line[i + 4] &&
        !line[i + 5] &&
        line[i + 6] &&
        line[i + 7] &&
        line[i + 8] &&
        !line[i + 9] &&
        line[i + 10]
      ) {
        score += 40;
      }
    }

    return score;
  }

  function getBit(value, index) {
    return ((value >>> index) & 1) !== 0;
  }

  function toSvg(qr, options) {
    const quietZone = Math.max(0, (options && options.quietZone) || 4);
    const moduleSize = Math.max(1, (options && options.moduleSize) || 8);
    const ink = (options && options.ink) || "#11130f";
    const paper = (options && options.paper) || "#ffffff";
    const totalModules = qr.size + quietZone * 2;
    const size = totalModules * moduleSize;
    let paths = "";

    for (let y = 0; y < qr.size; y += 1) {
      for (let x = 0; x < qr.size; x += 1) {
        if (qr.modules[y][x]) {
          paths += `M${(x + quietZone) * moduleSize},${(y + quietZone) * moduleSize}h${moduleSize}v${moduleSize}h-${moduleSize}z`;
        }
      }
    }

    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges">`,
      `<rect width="100%" height="100%" fill="${escapeXml(paper)}"/>`,
      `<path fill="${escapeXml(ink)}" d="${paths}"/>`,
      "</svg>",
    ].join("");
  }

  function escapeXml(value) {
    return String(value).replace(/[&<>"']/g, (char) => {
      switch (char) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        default:
          return "&#39;";
      }
    });
  }

  global.QrEngine = {
    encode,
    toSvg,
    levels: ERROR_LEVELS,
    internals: {
      getByteCapacity,
      getNumDataCodewords,
    },
  };
})(globalThis);
