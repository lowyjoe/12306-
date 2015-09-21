
// Copyright 2006 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.


// Known Issues:
//
// * Patterns only support repeat.
// * Radial gradient are not implemented. The VML version of these look very
//   different from the canvas one.
// * Clipping paths are not implemented.
// * Coordsize. The width and height attribute have higher priority than the
//   width and height style values which isn't correct.
// * Painting mode isn't implemented.
// * Canvas width/height should is using content-box by default. IE in
//   Quirks mode will draw the canvas using border-box. Either change your
//   doctype to HTML5
//   (http://www.whatwg.org/specs/web-apps/current-work/#the-doctype)
//   or use Box Sizing Behavior from WebFX
//   (http://webfx.eae.net/dhtml/boxsizing/boxsizing.html)
// * Non uniform scaling does not correctly scale strokes.
// * Optimize. There is always room for speed improvements.

// AMD by kener.linfeng@gmail.com
define('zrender/dep/excanvas',['require'],function(require) {
    
// Only add this code if we do not already have a canvas implementation
if (!document.createElement('canvas').getContext) {

(function() {

  // alias some functions to make (compiled) code shorter
  var m = Math;
  var mr = m.round;
  var ms = m.sin;
  var mc = m.cos;
  var abs = m.abs;
  var sqrt = m.sqrt;

  // this is used for sub pixel precision
  var Z = 10;
  var Z2 = Z / 2;

  var IE_VERSION = +navigator.userAgent.match(/MSIE ([\d.]+)?/)[1];

  /**
   * This funtion is assigned to the <canvas> elements as element.getContext().
   * @this {HTMLElement}
   * @return {CanvasRenderingContext2D_}
   */
  function getContext() {
    return this.context_ ||
        (this.context_ = new CanvasRenderingContext2D_(this));
  }

  var slice = Array.prototype.slice;

  /**
   * Binds a function to an object. The returned function will always use the
   * passed in {@code obj} as {@code this}.
   *
   * Example:
   *
   *   g = bind(f, obj, a, b)
   *   g(c, d) // will do f.call(obj, a, b, c, d)
   *
   * @param {Function} f The function to bind the object to
   * @param {Object} obj The object that should act as this when the function
   *     is called
   * @param {*} var_args Rest arguments that will be used as the initial
   *     arguments when the function is called
   * @return {Function} A new function that has bound this
   */
  function bind(f, obj, var_args) {
    var a = slice.call(arguments, 2);
    return function() {
      return f.apply(obj, a.concat(slice.call(arguments)));
    };
  }

  function encodeHtmlAttribute(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  function addNamespace(doc, prefix, urn) {
    if (!doc.namespaces[prefix]) {
      doc.namespaces.add(prefix, urn, '#default#VML');
    }
  }

  function addNamespacesAndStylesheet(doc) {
    addNamespace(doc, 'g_vml_', 'urn:schemas-microsoft-com:vml');
    addNamespace(doc, 'g_o_', 'urn:schemas-microsoft-com:office:office');

    // Setup default CSS.  Only add one style sheet per document
    if (!doc.styleSheets['ex_canvas_']) {
      var ss = doc.createStyleSheet();
      ss.owningElement.id = 'ex_canvas_';
      ss.cssText = 'canvas{display:inline-block;overflow:hidden;' +
          // default size is 300x150 in Gecko and Opera
          'text-align:left;width:300px;height:150px}';
    }
  }

  // Add namespaces and stylesheet at startup.
  addNamespacesAndStylesheet(document);

  var G_vmlCanvasManager_ = {
    init: function(opt_doc) {
      var doc = opt_doc || document;
      // Create a dummy element so that IE will allow canvas elements to be
      // recognized.
      doc.createElement('canvas');
      doc.attachEvent('onreadystatechange', bind(this.init_, this, doc));
    },

    init_: function(doc) {
      // find all canvas elements
      var els = doc.getElementsByTagName('canvas');
      for (var i = 0; i < els.length; i++) {
        this.initElement(els[i]);
      }
    },

    /**
     * Public initializes a canvas element so that it can be used as canvas
     * element from now on. This is called automatically before the page is
     * loaded but if you are creating elements using createElement you need to
     * make sure this is called on the element.
     * @param {HTMLElement} el The canvas element to initialize.
     * @return {HTMLElement} the element that was created.
     */
    initElement: function(el) {
      if (!el.getContext) {
        el.getContext = getContext;

        // Add namespaces and stylesheet to document of the element.
        addNamespacesAndStylesheet(el.ownerDocument);

        // Remove fallback content. There is no way to hide text nodes so we
        // just remove all childNodes. We could hide all elements and remove
        // text nodes but who really cares about the fallback content.
        el.innerHTML = '';

        // do not use inline function because that will leak memory
        el.attachEvent('onpropertychange', onPropertyChange);
        el.attachEvent('onresize', onResize);

        var attrs = el.attributes;
        if (attrs.width && attrs.width.specified) {
          // TODO: use runtimeStyle and coordsize
          // el.getContext().setWidth_(attrs.width.nodeValue);
          el.style.width = attrs.width.nodeValue + 'px';
        } else {
          el.width = el.clientWidth;
        }
        if (attrs.height && attrs.height.specified) {
          // TODO: use runtimeStyle and coordsize
          // el.getContext().setHeight_(attrs.height.nodeValue);
          el.style.height = attrs.height.nodeValue + 'px';
        } else {
          el.height = el.clientHeight;
        }
        //el.getContext().setCoordsize_()
      }
      return el;
    }
  };

  function onPropertyChange(e) {
    var el = e.srcElement;

    switch (e.propertyName) {
      case 'width':
        el.getContext().clearRect();
        el.style.width = el.attributes.width.nodeValue + 'px';
        // In IE8 this does not trigger onresize.
        el.firstChild.style.width =  el.clientWidth + 'px';
        break;
      case 'height':
        el.getContext().clearRect();
        el.style.height = el.attributes.height.nodeValue + 'px';
        el.firstChild.style.height = el.clientHeight + 'px';
        break;
    }
  }

  function onResize(e) {
    var el = e.srcElement;
    if (el.firstChild) {
      el.firstChild.style.width =  el.clientWidth + 'px';
      el.firstChild.style.height = el.clientHeight + 'px';
    }
  }

  G_vmlCanvasManager_.init();

  // precompute "00" to "FF"
  var decToHex = [];
  for (var i = 0; i < 16; i++) {
    for (var j = 0; j < 16; j++) {
      decToHex[i * 16 + j] = i.toString(16) + j.toString(16);
    }
  }

  function createMatrixIdentity() {
    return [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ];
  }

  function matrixMultiply(m1, m2) {
    var result = createMatrixIdentity();

    for (var x = 0; x < 3; x++) {
      for (var y = 0; y < 3; y++) {
        var sum = 0;

        for (var z = 0; z < 3; z++) {
          sum += m1[x][z] * m2[z][y];
        }

        result[x][y] = sum;
      }
    }
    return result;
  }

  function copyState(o1, o2) {
    o2.fillStyle     = o1.fillStyle;
    o2.lineCap       = o1.lineCap;
    o2.lineJoin      = o1.lineJoin;
    o2.lineWidth     = o1.lineWidth;
    o2.miterLimit    = o1.miterLimit;
    o2.shadowBlur    = o1.shadowBlur;
    o2.shadowColor   = o1.shadowColor;
    o2.shadowOffsetX = o1.shadowOffsetX;
    o2.shadowOffsetY = o1.shadowOffsetY;
    o2.strokeStyle   = o1.strokeStyle;
    o2.globalAlpha   = o1.globalAlpha;
    o2.font          = o1.font;
    o2.textAlign     = o1.textAlign;
    o2.textBaseline  = o1.textBaseline;
    o2.scaleX_    = o1.scaleX_;
    o2.scaleY_    = o1.scaleY_;
    o2.lineScale_    = o1.lineScale_;
  }

  var colorData = {
    aliceblue: '#F0F8FF',
    antiquewhite: '#FAEBD7',
    aquamarine: '#7FFFD4',
    azure: '#F0FFFF',
    beige: '#F5F5DC',
    bisque: '#FFE4C4',
    black: '#000000',
    blanchedalmond: '#FFEBCD',
    blueviolet: '#8A2BE2',
    brown: '#A52A2A',
    burlywood: '#DEB887',
    cadetblue: '#5F9EA0',
    chartreuse: '#7FFF00',
    chocolate: '#D2691E',
    coral: '#FF7F50',
    cornflowerblue: '#6495ED',
    cornsilk: '#FFF8DC',
    crimson: '#DC143C',
    cyan: '#00FFFF',
    darkblue: '#00008B',
    darkcyan: '#008B8B',
    darkgoldenrod: '#B8860B',
    darkgray: '#A9A9A9',
    darkgreen: '#006400',
    darkgrey: '#A9A9A9',
    darkkhaki: '#BDB76B',
    darkmagenta: '#8B008B',
    darkolivegreen: '#556B2F',
    darkorange: '#FF8C00',
    darkorchid: '#9932CC',
    darkred: '#8B0000',
    darksalmon: '#E9967A',
    darkseagreen: '#8FBC8F',
    darkslateblue: '#483D8B',
    darkslategray: '#2F4F4F',
    darkslategrey: '#2F4F4F',
    darkturquoise: '#00CED1',
    darkviolet: '#9400D3',
    deeppink: '#FF1493',
    deepskyblue: '#00BFFF',
    dimgray: '#696969',
    dimgrey: '#696969',
    dodgerblue: '#1E90FF',
    firebrick: '#B22222',
    floralwhite: '#FFFAF0',
    forestgreen: '#228B22',
    gainsboro: '#DCDCDC',
    ghostwhite: '#F8F8FF',
    gold: '#FFD700',
    goldenrod: '#DAA520',
    grey: '#808080',
    greenyellow: '#ADFF2F',
    honeydew: '#F0FFF0',
    hotpink: '#FF69B4',
    indianred: '#CD5C5C',
    indigo: '#4B0082',
    ivory: '#FFFFF0',
    khaki: '#F0E68C',
    lavender: '#E6E6FA',
    lavenderblush: '#FFF0F5',
    lawngreen: '#7CFC00',
    lemonchiffon: '#FFFACD',
    lightblue: '#ADD8E6',
    lightcoral: '#F08080',
    lightcyan: '#E0FFFF',
    lightgoldenrodyellow: '#FAFAD2',
    lightgreen: '#90EE90',
    lightgrey: '#D3D3D3',
    lightpink: '#FFB6C1',
    lightsalmon: '#FFA07A',
    lightseagreen: '#20B2AA',
    lightskyblue: '#87CEFA',
    lightslategray: '#778899',
    lightslategrey: '#778899',
    lightsteelblue: '#B0C4DE',
    lightyellow: '#FFFFE0',
    limegreen: '#32CD32',
    linen: '#FAF0E6',
    magenta: '#FF00FF',
    mediumaquamarine: '#66CDAA',
    mediumblue: '#0000CD',
    mediumorchid: '#BA55D3',
    mediumpurple: '#9370DB',
    mediumseagreen: '#3CB371',
    mediumslateblue: '#7B68EE',
    mediumspringgreen: '#00FA9A',
    mediumturquoise: '#48D1CC',
    mediumvioletred: '#C71585',
    midnightblue: '#191970',
    mintcream: '#F5FFFA',
    mistyrose: '#FFE4E1',
    moccasin: '#FFE4B5',
    navajowhite: '#FFDEAD',
    oldlace: '#FDF5E6',
    olivedrab: '#6B8E23',
    orange: '#FFA500',
    orangered: '#FF4500',
    orchid: '#DA70D6',
    palegoldenrod: '#EEE8AA',
    palegreen: '#98FB98',
    paleturquoise: '#AFEEEE',
    palevioletred: '#DB7093',
    papayawhip: '#FFEFD5',
    peachpuff: '#FFDAB9',
    peru: '#CD853F',
    pink: '#FFC0CB',
    plum: '#DDA0DD',
    powderblue: '#B0E0E6',
    rosybrown: '#BC8F8F',
    royalblue: '#4169E1',
    saddlebrown: '#8B4513',
    salmon: '#FA8072',
    sandybrown: '#F4A460',
    seagreen: '#2E8B57',
    seashell: '#FFF5EE',
    sienna: '#A0522D',
    skyblue: '#87CEEB',
    slateblue: '#6A5ACD',
    slategray: '#708090',
    slategrey: '#708090',
    snow: '#FFFAFA',
    springgreen: '#00FF7F',
    steelblue: '#4682B4',
    tan: '#D2B48C',
    thistle: '#D8BFD8',
    tomato: '#FF6347',
    turquoise: '#40E0D0',
    violet: '#EE82EE',
    wheat: '#F5DEB3',
    whitesmoke: '#F5F5F5',
    yellowgreen: '#9ACD32'
  };


  function getRgbHslContent(styleString) {
    var start = styleString.indexOf('(', 3);
    var end = styleString.indexOf(')', start + 1);
    var parts = styleString.substring(start + 1, end).split(',');
    // add alpha if needed
    if (parts.length != 4 || styleString.charAt(3) != 'a') {
      parts[3] = 1;
    }
    return parts;
  }

  function percent(s) {
    return parseFloat(s) / 100;
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function hslToRgb(parts){
    var r, g, b, h, s, l;
    h = parseFloat(parts[0]) / 360 % 360;
    if (h < 0)
      h++;
    s = clamp(percent(parts[1]), 0, 1);
    l = clamp(percent(parts[2]), 0, 1);
    if (s == 0) {
      r = g = b = l; // achromatic
    } else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = hueToRgb(p, q, h + 1 / 3);
      g = hueToRgb(p, q, h);
      b = hueToRgb(p, q, h - 1 / 3);
    }

    return '#' + decToHex[Math.floor(r * 255)] +
        decToHex[Math.floor(g * 255)] +
        decToHex[Math.floor(b * 255)];
  }

  function hueToRgb(m1, m2, h) {
    if (h < 0)
      h++;
    if (h > 1)
      h--;

    if (6 * h < 1)
      return m1 + (m2 - m1) * 6 * h;
    else if (2 * h < 1)
      return m2;
    else if (3 * h < 2)
      return m1 + (m2 - m1) * (2 / 3 - h) * 6;
    else
      return m1;
  }

  var processStyleCache = {};

  function processStyle(styleString) {
    if (styleString in processStyleCache) {
      return processStyleCache[styleString];
    }

    var str, alpha = 1;

    styleString = String(styleString);
    if (styleString.charAt(0) == '#') {
      str = styleString;
    } else if (/^rgb/.test(styleString)) {
      var parts = getRgbHslContent(styleString);
      var str = '#', n;
      for (var i = 0; i < 3; i++) {
        if (parts[i].indexOf('%') != -1) {
          n = Math.floor(percent(parts[i]) * 255);
        } else {
          n = +parts[i];
        }
        str += decToHex[clamp(n, 0, 255)];
      }
      alpha = +parts[3];
    } else if (/^hsl/.test(styleString)) {
      var parts = getRgbHslContent(styleString);
      str = hslToRgb(parts);
      alpha = parts[3];
    } else {
      str = colorData[styleString] || styleString;
    }
    return processStyleCache[styleString] = {color: str, alpha: alpha};
  }

  var DEFAULT_STYLE = {
    style: 'normal',
    variant: 'normal',
    weight: 'normal',
    size: 12,           //10
    family: '微软雅黑'     //'sans-serif'
  };

  // Internal text style cache
  var fontStyleCache = {};

  function processFontStyle(styleString) {
    if (fontStyleCache[styleString]) {
      return fontStyleCache[styleString];
    }

    var el = document.createElement('div');
    var style = el.style;
    var fontFamily;
    try {
      style.font = styleString;
      fontFamily = style.fontFamily.split(',')[0];
    } catch (ex) {
      // Ignore failures to set to invalid font.
    }

    return fontStyleCache[styleString] = {
      style: style.fontStyle || DEFAULT_STYLE.style,
      variant: style.fontVariant || DEFAULT_STYLE.variant,
      weight: style.fontWeight || DEFAULT_STYLE.weight,
      size: style.fontSize || DEFAULT_STYLE.size,
      family: fontFamily || DEFAULT_STYLE.family
    };
  }

  function getComputedStyle(style, element) {
    var computedStyle = {};

    for (var p in style) {
      computedStyle[p] = style[p];
    }

    // Compute the size
    var canvasFontSize = parseFloat(element.currentStyle.fontSize),
        fontSize = parseFloat(style.size);

    if (typeof style.size == 'number') {
      computedStyle.size = style.size;
    } else if (style.size.indexOf('px') != -1) {
      computedStyle.size = fontSize;
    } else if (style.size.indexOf('em') != -1) {
      computedStyle.size = canvasFontSize * fontSize;
    } else if(style.size.indexOf('%') != -1) {
      computedStyle.size = (canvasFontSize / 100) * fontSize;
    } else if (style.size.indexOf('pt') != -1) {
      computedStyle.size = fontSize / .75;
    } else {
      computedStyle.size = canvasFontSize;
    }

    // Different scaling between normal text and VML text. This was found using
    // trial and error to get the same size as non VML text.
    //computedStyle.size *= 0.981;

    return computedStyle;
  }

  function buildStyle(style) {
    return style.style + ' ' + style.variant + ' ' + style.weight + ' ' +
        style.size + "px '" + style.family + "'";
  }

  var lineCapMap = {
    'butt': 'flat',
    'round': 'round'
  };

  function processLineCap(lineCap) {
    return lineCapMap[lineCap] || 'square';
  }

  /**
   * This class implements CanvasRenderingContext2D interface as described by
   * the WHATWG.
   * @param {HTMLElement} canvasElement The element that the 2D context should
   * be associated with
   */
  function CanvasRenderingContext2D_(canvasElement) {
    this.m_ = createMatrixIdentity();

    this.mStack_ = [];
    this.aStack_ = [];
    this.currentPath_ = [];

    // Canvas context properties
    this.strokeStyle = '#000';
    this.fillStyle = '#000';

    this.lineWidth = 1;
    this.lineJoin = 'miter';
    this.lineCap = 'butt';
    this.miterLimit = Z * 1;
    this.globalAlpha = 1;
    // this.font = '10px sans-serif';
    this.font = '12px 微软雅黑';        // 决定还是改这吧，影响代价最小
    this.textAlign = 'left';
    this.textBaseline = 'alphabetic';
    this.canvas = canvasElement;

    var cssText = 'width:' + canvasElement.clientWidth + 'px;height:' +
        canvasElement.clientHeight + 'px;overflow:hidden;position:absolute';
    var el = canvasElement.ownerDocument.createElement('div');
    el.style.cssText = cssText;
    canvasElement.appendChild(el);

    var overlayEl = el.cloneNode(false);
    // Use a non transparent background.
    overlayEl.style.backgroundColor = '#fff'; //red, I don't know why, it work! 
    overlayEl.style.filter = 'alpha(opacity=0)';
    canvasElement.appendChild(overlayEl);

    this.element_ = el;
    this.scaleX_ = 1;
    this.scaleY_ = 1;
    this.lineScale_ = 1;
  }

  var contextPrototype = CanvasRenderingContext2D_.prototype;
  contextPrototype.clearRect = function() {
    if (this.textMeasureEl_) {
      this.textMeasureEl_.removeNode(true);
      this.textMeasureEl_ = null;
    }
    this.element_.innerHTML = '';
  };

  contextPrototype.beginPath = function() {
    // TODO: Branch current matrix so that save/restore has no effect
    //       as per safari docs.
    this.currentPath_ = [];
  };

  contextPrototype.moveTo = function(aX, aY) {
    var p = getCoords(this, aX, aY);
    this.currentPath_.push({type: 'moveTo', x: p.x, y: p.y});
    this.currentX_ = p.x;
    this.currentY_ = p.y;
  };

  contextPrototype.lineTo = function(aX, aY) {
    var p = getCoords(this, aX, aY);
    this.currentPath_.push({type: 'lineTo', x: p.x, y: p.y});

    this.currentX_ = p.x;
    this.currentY_ = p.y;
  };

  contextPrototype.bezierCurveTo = function(aCP1x, aCP1y,
                                            aCP2x, aCP2y,
                                            aX, aY) {
    var p = getCoords(this, aX, aY);
    var cp1 = getCoords(this, aCP1x, aCP1y);
    var cp2 = getCoords(this, aCP2x, aCP2y);
    bezierCurveTo(this, cp1, cp2, p);
  };

  // Helper function that takes the already fixed cordinates.
  function bezierCurveTo(self, cp1, cp2, p) {
    self.currentPath_.push({
      type: 'bezierCurveTo',
      cp1x: cp1.x,
      cp1y: cp1.y,
      cp2x: cp2.x,
      cp2y: cp2.y,
      x: p.x,
      y: p.y
    });
    self.currentX_ = p.x;
    self.currentY_ = p.y;
  }

  contextPrototype.quadraticCurveTo = function(aCPx, aCPy, aX, aY) {
    // the following is lifted almost directly from
    // http://developer.mozilla.org/en/docs/Canvas_tutorial:Drawing_shapes

    var cp = getCoords(this, aCPx, aCPy);
    var p = getCoords(this, aX, aY);

    var cp1 = {
      x: this.currentX_ + 2.0 / 3.0 * (cp.x - this.currentX_),
      y: this.currentY_ + 2.0 / 3.0 * (cp.y - this.currentY_)
    };
    var cp2 = {
      x: cp1.x + (p.x - this.currentX_) / 3.0,
      y: cp1.y + (p.y - this.currentY_) / 3.0
    };

    bezierCurveTo(this, cp1, cp2, p);
  };

  contextPrototype.arc = function(aX, aY, aRadius,
                                  aStartAngle, aEndAngle, aClockwise) {
    aRadius *= Z;
    var arcType = aClockwise ? 'at' : 'wa';

    var xStart = aX + mc(aStartAngle) * aRadius - Z2;
    var yStart = aY + ms(aStartAngle) * aRadius - Z2;

    var xEnd = aX + mc(aEndAngle) * aRadius - Z2;
    var yEnd = aY + ms(aEndAngle) * aRadius - Z2;

    // IE won't render arches drawn counter clockwise if xStart == xEnd.
    if (xStart == xEnd && !aClockwise) {
      xStart += 0.125; // Offset xStart by 1/80 of a pixel. Use something
                       // that can be represented in binary
    }

    var p = getCoords(this, aX, aY);
    var pStart = getCoords(this, xStart, yStart);
    var pEnd = getCoords(this, xEnd, yEnd);

    this.currentPath_.push({type: arcType,
                           x: p.x,
                           y: p.y,
                           radius: aRadius,
                           xStart: pStart.x,
                           yStart: pStart.y,
                           xEnd: pEnd.x,
                           yEnd: pEnd.y});

  };

  contextPrototype.rect = function(aX, aY, aWidth, aHeight) {
    this.moveTo(aX, aY);
    this.lineTo(aX + aWidth, aY);
    this.lineTo(aX + aWidth, aY + aHeight);
    this.lineTo(aX, aY + aHeight);
    this.closePath();
  };

  contextPrototype.strokeRect = function(aX, aY, aWidth, aHeight) {
    var oldPath = this.currentPath_;
    this.beginPath();

    this.moveTo(aX, aY);
    this.lineTo(aX + aWidth, aY);
    this.lineTo(aX + aWidth, aY + aHeight);
    this.lineTo(aX, aY + aHeight);
    this.closePath();
    this.stroke();

    this.currentPath_ = oldPath;
  };

  contextPrototype.fillRect = function(aX, aY, aWidth, aHeight) {
    var oldPath = this.currentPath_;
    this.beginPath();

    this.moveTo(aX, aY);
    this.lineTo(aX + aWidth, aY);
    this.lineTo(aX + aWidth, aY + aHeight);
    this.lineTo(aX, aY + aHeight);
    this.closePath();
    this.fill();

    this.currentPath_ = oldPath;
  };

  contextPrototype.createLinearGradient = function(aX0, aY0, aX1, aY1) {
    var gradient = new CanvasGradient_('gradient');
    gradient.x0_ = aX0;
    gradient.y0_ = aY0;
    gradient.x1_ = aX1;
    gradient.y1_ = aY1;
    return gradient;
  };

  contextPrototype.createRadialGradient = function(aX0, aY0, aR0,
                                                   aX1, aY1, aR1) {
    var gradient = new CanvasGradient_('gradientradial');
    gradient.x0_ = aX0;
    gradient.y0_ = aY0;
    gradient.r0_ = aR0;
    gradient.x1_ = aX1;
    gradient.y1_ = aY1;
    gradient.r1_ = aR1;
    return gradient;
  };

  contextPrototype.drawImage = function(image, var_args) {
    var dx, dy, dw, dh, sx, sy, sw, sh;

    // to find the original width we overide the width and height
    var oldRuntimeWidth = image.runtimeStyle.width;
    var oldRuntimeHeight = image.runtimeStyle.height;
    image.runtimeStyle.width = 'auto';
    image.runtimeStyle.height = 'auto';

    // get the original size
    var w = image.width;
    var h = image.height;

    // and remove overides
    image.runtimeStyle.width = oldRuntimeWidth;
    image.runtimeStyle.height = oldRuntimeHeight;

    if (arguments.length == 3) {
      dx = arguments[1];
      dy = arguments[2];
      sx = sy = 0;
      sw = dw = w;
      sh = dh = h;
    } else if (arguments.length == 5) {
      dx = arguments[1];
      dy = arguments[2];
      dw = arguments[3];
      dh = arguments[4];
      sx = sy = 0;
      sw = w;
      sh = h;
    } else if (arguments.length == 9) {
      sx = arguments[1];
      sy = arguments[2];
      sw = arguments[3];
      sh = arguments[4];
      dx = arguments[5];
      dy = arguments[6];
      dw = arguments[7];
      dh = arguments[8];
    } else {
      throw Error('Invalid number of arguments');
    }

    var d = getCoords(this, dx, dy);

    var w2 = sw / 2;
    var h2 = sh / 2;

    var vmlStr = [];

    var W = 10;
    var H = 10;

    var scaleX = scaleY = 1;
    
    // For some reason that I've now forgotten, using divs didn't work
    vmlStr.push(' <g_vml_:group',
                ' coordsize="', Z * W, ',', Z * H, '"',
                ' coordorigin="0,0"' ,
                ' style="width:', W, 'px;height:', H, 'px;position:absolute;');

    // If filters are necessary (rotation exists), create them
    // filters are bog-slow, so only create them if abbsolutely necessary
    // The following check doesn't account for skews (which don't exist
    // in the canvas spec (yet) anyway.

    if (this.m_[0][0] != 1 || this.m_[0][1] ||
        this.m_[1][1] != 1 || this.m_[1][0]) {
      var filter = [];

     var scaleX = this.scaleX_;
     var scaleY = this.scaleY_;
      // Note the 12/21 reversal
      filter.push('M11=', this.m_[0][0] / scaleX, ',',
                  'M12=', this.m_[1][0] / scaleY, ',',
                  'M21=', this.m_[0][1] / scaleX, ',',
                  'M22=', this.m_[1][1] / scaleY, ',',
                  'Dx=', mr(d.x / Z), ',',
                  'Dy=', mr(d.y / Z), '');

      // Bounding box calculation (need to minimize displayed area so that
      // filters don't waste time on unused pixels.
      var max = d;
      var c2 = getCoords(this, dx + dw, dy);
      var c3 = getCoords(this, dx, dy + dh);
      var c4 = getCoords(this, dx + dw, dy + dh);

      max.x = m.max(max.x, c2.x, c3.x, c4.x);
      max.y = m.max(max.y, c2.y, c3.y, c4.y);

      vmlStr.push('padding:0 ', mr(max.x / Z), 'px ', mr(max.y / Z),
                  'px 0;filter:progid:DXImageTransform.Microsoft.Matrix(',
                  filter.join(''), ", SizingMethod='clip');");

    } else {
      vmlStr.push('top:', mr(d.y / Z), 'px;left:', mr(d.x / Z), 'px;');
    }

    vmlStr.push(' ">');

    // Draw a special cropping div if needed
    if (sx || sy) {
      // Apply scales to width and height
      vmlStr.push('<div style="overflow: hidden; width:', Math.ceil((dw + sx * dw / sw) * scaleX), 'px;',
                  ' height:', Math.ceil((dh + sy * dh / sh) * scaleY), 'px;',
                  ' filter:progid:DxImageTransform.Microsoft.Matrix(Dx=',
                  -sx * dw / sw * scaleX, ',Dy=', -sy * dh / sh * scaleY, ');">');
    }
    
      
    // Apply scales to width and height
    vmlStr.push('<div style="width:', Math.round(scaleX * w * dw / sw), 'px;',
                ' height:', Math.round(scaleY * h * dh / sh), 'px;',
                ' filter:');
   
    // If there is a globalAlpha, apply it to image
    if(this.globalAlpha < 1) {
      vmlStr.push(' progid:DXImageTransform.Microsoft.Alpha(opacity=' + (this.globalAlpha * 100) + ')');
    }
    
    vmlStr.push(' progid:DXImageTransform.Microsoft.AlphaImageLoader(src=', image.src, ',sizingMethod=scale)">');
    
    // Close the crop div if necessary            
    if (sx || sy) vmlStr.push('</div>');
    
    vmlStr.push('</div></div>');
    
    this.element_.insertAdjacentHTML('BeforeEnd', vmlStr.join(''));
  };

  contextPrototype.stroke = function(aFill) {
    var lineStr = [];
    var lineOpen = false;

    var W = 10;
    var H = 10;

    lineStr.push('<g_vml_:shape',
                 ' filled="', !!aFill, '"',
                 ' style="position:absolute;width:', W, 'px;height:', H, 'px;"',
                 ' coordorigin="0,0"',
                 ' coordsize="', Z * W, ',', Z * H, '"',
                 ' stroked="', !aFill, '"',
                 ' path="');

    var newSeq = false;
    var min = {x: null, y: null};
    var max = {x: null, y: null};

    for (var i = 0; i < this.currentPath_.length; i++) {
      var p = this.currentPath_[i];
      var c;

      switch (p.type) {
        case 'moveTo':
          c = p;
          lineStr.push(' m ', mr(p.x), ',', mr(p.y));
          break;
        case 'lineTo':
          lineStr.push(' l ', mr(p.x), ',', mr(p.y));
          break;
        case 'close':
          lineStr.push(' x ');
          p = null;
          break;
        case 'bezierCurveTo':
          lineStr.push(' c ',
                       mr(p.cp1x), ',', mr(p.cp1y), ',',
                       mr(p.cp2x), ',', mr(p.cp2y), ',',
                       mr(p.x), ',', mr(p.y));
          break;
        case 'at':
        case 'wa':
          lineStr.push(' ', p.type, ' ',
                       mr(p.x - this.scaleX_ * p.radius), ',',
                       mr(p.y - this.scaleY_ * p.radius), ' ',
                       mr(p.x + this.scaleX_ * p.radius), ',',
                       mr(p.y + this.scaleY_ * p.radius), ' ',
                       mr(p.xStart), ',', mr(p.yStart), ' ',
                       mr(p.xEnd), ',', mr(p.yEnd));
          break;
      }


      // TODO: Following is broken for curves due to
      //       move to proper paths.

      // Figure out dimensions so we can do gradient fills
      // properly
      if (p) {
        if (min.x == null || p.x < min.x) {
          min.x = p.x;
        }
        if (max.x == null || p.x > max.x) {
          max.x = p.x;
        }
        if (min.y == null || p.y < min.y) {
          min.y = p.y;
        }
        if (max.y == null || p.y > max.y) {
          max.y = p.y;
        }
      }
    }
    lineStr.push(' ">');

    if (!aFill) {
      appendStroke(this, lineStr);
    } else {
      appendFill(this, lineStr, min, max);
    }

    lineStr.push('</g_vml_:shape>');

    this.element_.insertAdjacentHTML('beforeEnd', lineStr.join(''));
  };

  function appendStroke(ctx, lineStr) {
    var a = processStyle(ctx.strokeStyle);
    var color = a.color;
    var opacity = a.alpha * ctx.globalAlpha;
    var lineWidth = ctx.lineScale_ * ctx.lineWidth;

    // VML cannot correctly render a line if the width is less than 1px.
    // In that case, we dilute the color to make the line look thinner.
    if (lineWidth < 1) {
      opacity *= lineWidth;
    }

    lineStr.push(
      '<g_vml_:stroke',
      ' opacity="', opacity, '"',
      ' joinstyle="', ctx.lineJoin, '"',
      ' miterlimit="', ctx.miterLimit, '"',
      ' endcap="', processLineCap(ctx.lineCap), '"',
      ' weight="', lineWidth, 'px"',
      ' color="', color, '" />'
    );
  }

  function appendFill(ctx, lineStr, min, max) {
    var fillStyle = ctx.fillStyle;
    var arcScaleX = ctx.scaleX_;
    var arcScaleY = ctx.scaleY_;
    var width = max.x - min.x;
    var height = max.y - min.y;
    if (fillStyle instanceof CanvasGradient_) {
      // TODO: Gradients transformed with the transformation matrix.
      var angle = 0;
      var focus = {x: 0, y: 0};

      // additional offset
      var shift = 0;
      // scale factor for offset
      var expansion = 1;

      if (fillStyle.type_ == 'gradient') {
        var x0 = fillStyle.x0_ / arcScaleX;
        var y0 = fillStyle.y0_ / arcScaleY;
        var x1 = fillStyle.x1_ / arcScaleX;
        var y1 = fillStyle.y1_ / arcScaleY;
        var p0 = getCoords(ctx, x0, y0);
        var p1 = getCoords(ctx, x1, y1);
        var dx = p1.x - p0.x;
        var dy = p1.y - p0.y;
        angle = Math.atan2(dx, dy) * 180 / Math.PI;

        // The angle should be a non-negative number.
        if (angle < 0) {
          angle += 360;
        }

        // Very small angles produce an unexpected result because they are
        // converted to a scientific notation string.
        if (angle < 1e-6) {
          angle = 0;
        }
      } else {
        var p0 = getCoords(ctx, fillStyle.x0_, fillStyle.y0_);
        focus = {
          x: (p0.x - min.x) / width,
          y: (p0.y - min.y) / height
        };

        width  /= arcScaleX * Z;
        height /= arcScaleY * Z;
        var dimension = m.max(width, height);
        shift = 2 * fillStyle.r0_ / dimension;
        expansion = 2 * fillStyle.r1_ / dimension - shift;
      }

      // We need to sort the color stops in ascending order by offset,
      // otherwise IE won't interpret it correctly.
      var stops = fillStyle.colors_;
      stops.sort(function(cs1, cs2) {
        return cs1.offset - cs2.offset;
      });

      var length = stops.length;
      var color1 = stops[0].color;
      var color2 = stops[length - 1].color;
      var opacity1 = stops[0].alpha * ctx.globalAlpha;
      var opacity2 = stops[length - 1].alpha * ctx.globalAlpha;

      var colors = [];
      for (var i = 0; i < length; i++) {
        var stop = stops[i];
        colors.push(stop.offset * expansion + shift + ' ' + stop.color);
      }

      // When colors attribute is used, the meanings of opacity and o:opacity2
      // are reversed.
      lineStr.push('<g_vml_:fill type="', fillStyle.type_, '"',
                   ' method="none" focus="100%"',
                   ' color="', color1, '"',
                   ' color2="', color2, '"',
                   ' colors="', colors.join(','), '"',
                   ' opacity="', opacity2, '"',
                   ' g_o_:opacity2="', opacity1, '"',
                   ' angle="', angle, '"',
                   ' focusposition="', focus.x, ',', focus.y, '" />');
    } else if (fillStyle instanceof CanvasPattern_) {
      if (width && height) {
        var deltaLeft = -min.x;
        var deltaTop = -min.y;
        lineStr.push('<g_vml_:fill',
                     ' position="',
                     deltaLeft / width * arcScaleX * arcScaleX, ',',
                     deltaTop / height * arcScaleY * arcScaleY, '"',
                     ' type="tile"',
                     // TODO: Figure out the correct size to fit the scale.
                     //' size="', w, 'px ', h, 'px"',
                     ' src="', fillStyle.src_, '" />');
       }
    } else {
      var a = processStyle(ctx.fillStyle);
      var color = a.color;
      var opacity = a.alpha * ctx.globalAlpha;
      lineStr.push('<g_vml_:fill color="', color, '" opacity="', opacity,
                   '" />');
    }
  }

  contextPrototype.fill = function() {
    this.stroke(true);
  };

  contextPrototype.closePath = function() {
    this.currentPath_.push({type: 'close'});
  };

  function getCoords(ctx, aX, aY) {
    var m = ctx.m_;
    return {
      x: Z * (aX * m[0][0] + aY * m[1][0] + m[2][0]) - Z2,
      y: Z * (aX * m[0][1] + aY * m[1][1] + m[2][1]) - Z2
    };
  };

  contextPrototype.save = function() {
    var o = {};
    copyState(this, o);
    this.aStack_.push(o);
    this.mStack_.push(this.m_);
    this.m_ = matrixMultiply(createMatrixIdentity(), this.m_);
  };

  contextPrototype.restore = function() {
    if (this.aStack_.length) {
      copyState(this.aStack_.pop(), this);
      this.m_ = this.mStack_.pop();
    }
  };

  function matrixIsFinite(m) {
    return isFinite(m[0][0]) && isFinite(m[0][1]) &&
        isFinite(m[1][0]) && isFinite(m[1][1]) &&
        isFinite(m[2][0]) && isFinite(m[2][1]);
  }

  function setM(ctx, m, updateLineScale) {
    if (!matrixIsFinite(m)) {
      return;
    }
    ctx.m_ = m;

    ctx.scaleX_ = Math.sqrt(m[0][0] * m[0][0] + m[0][1] * m[0][1]);
    ctx.scaleY_ = Math.sqrt(m[1][0] * m[1][0] + m[1][1] * m[1][1]);

    if (updateLineScale) {
      // Get the line scale.
      // Determinant of this.m_ means how much the area is enlarged by the
      // transformation. So its square root can be used as a scale factor
      // for width.
      var det = m[0][0] * m[1][1] - m[0][1] * m[1][0];
      ctx.lineScale_ = sqrt(abs(det));
    }
  }

  contextPrototype.translate = function(aX, aY) {
    var m1 = [
      [1,  0,  0],
      [0,  1,  0],
      [aX, aY, 1]
    ];

    setM(this, matrixMultiply(m1, this.m_), false);
  };

  contextPrototype.rotate = function(aRot) {
    var c = mc(aRot);
    var s = ms(aRot);

    var m1 = [
      [c,  s, 0],
      [-s, c, 0],
      [0,  0, 1]
    ];

    setM(this, matrixMultiply(m1, this.m_), false);
  };

  contextPrototype.scale = function(aX, aY) {
    var m1 = [
      [aX, 0,  0],
      [0,  aY, 0],
      [0,  0,  1]
    ];

    setM(this, matrixMultiply(m1, this.m_), true);
  };

  contextPrototype.transform = function(m11, m12, m21, m22, dx, dy) {
    var m1 = [
      [m11, m12, 0],
      [m21, m22, 0],
      [dx,  dy,  1]
    ];

    setM(this, matrixMultiply(m1, this.m_), true);

  };

  contextPrototype.setTransform = function(m11, m12, m21, m22, dx, dy) {
    var m = [
      [m11, m12, 0],
      [m21, m22, 0],
      [dx,  dy,  1]
    ];

    setM(this, m, true);
  };

  /**
   * The text drawing function.
   * The maxWidth argument isn't taken in account, since no browser supports
   * it yet.
   */
  contextPrototype.drawText_ = function(text, x, y, maxWidth, stroke) {
    var m = this.m_,
        delta = 1000,
        left = 0,
        right = delta,
        offset = {x: 0, y: 0},
        lineStr = [];

    var fontStyle = getComputedStyle(processFontStyle(this.font),
                                     this.element_);

    var fontStyleString = buildStyle(fontStyle);

    var elementStyle = this.element_.currentStyle;
    var textAlign = this.textAlign.toLowerCase();
    switch (textAlign) {
      case 'left':
      case 'center':
      case 'right':
        break;
      case 'end':
        textAlign = elementStyle.direction == 'ltr' ? 'right' : 'left';
        break;
      case 'start':
        textAlign = elementStyle.direction == 'rtl' ? 'right' : 'left';
        break;
      default:
        textAlign = 'left';
    }

    // 1.75 is an arbitrary number, as there is no info about the text baseline
    switch (this.textBaseline) {
      case 'hanging':
      case 'top':
        offset.y = fontStyle.size / 1.75;
        break;
      case 'middle':
        break;
      default:
      case null:
      case 'alphabetic':
      case 'ideographic':
      case 'bottom':
        offset.y = -fontStyle.size / 2.25;
        break;
    }

    switch(textAlign) {
      case 'right':
        left = delta;
        right = 0.05;
        break;
      case 'center':
        left = right = delta / 2;
        break;
    }

    var d = getCoords(this, x + offset.x, y + offset.y);

    lineStr.push('<g_vml_:line from="', -left ,' 0" to="', right ,' 0.05" ',
                 ' coordsize="100 100" coordorigin="0 0"',
                 ' filled="', !stroke, '" stroked="', !!stroke,
                 '" style="position:absolute;width:1px;height:1px;">');

    if (stroke) {
      appendStroke(this, lineStr);
    } else {
      // TODO: Fix the min and max params.
      appendFill(this, lineStr, {x: -left, y: 0},
                 {x: right, y: fontStyle.size});
    }

    var skewM = m[0][0].toFixed(3) + ',' + m[1][0].toFixed(3) + ',' +
                m[0][1].toFixed(3) + ',' + m[1][1].toFixed(3) + ',0,0';

    var skewOffset = mr(d.x / Z) + ',' + mr(d.y / Z);

    lineStr.push('<g_vml_:skew on="t" matrix="', skewM ,'" ',
                 ' offset="', skewOffset, '" origin="', left ,' 0" />',
                 '<g_vml_:path textpathok="true" />',
                 '<g_vml_:textpath on="true" string="',
                 encodeHtmlAttribute(text),
                 '" style="v-text-align:', textAlign,
                 ';font:', encodeHtmlAttribute(fontStyleString),
                 '" /></g_vml_:line>');

    this.element_.insertAdjacentHTML('beforeEnd', lineStr.join(''));
  };

  contextPrototype.fillText = function(text, x, y, maxWidth) {
    this.drawText_(text, x, y, maxWidth, false);
  };

  contextPrototype.strokeText = function(text, x, y, maxWidth) {
    this.drawText_(text, x, y, maxWidth, true);
  };

  contextPrototype.measureText = function(text) {
    if (!this.textMeasureEl_) {
      var s = '<span style="position:absolute;' +
          'top:-20000px;left:0;padding:0;margin:0;border:none;' +
          'white-space:pre;"></span>';
      this.element_.insertAdjacentHTML('beforeEnd', s);
      this.textMeasureEl_ = this.element_.lastChild;
    }
    var doc = this.element_.ownerDocument;
    this.textMeasureEl_.innerHTML = '';
    try {
        this.textMeasureEl_.style.font = this.font;
    } catch (ex) {
        // Ignore failures to set to invalid font.
    }
    
    // Don't use innerHTML or innerText because they allow markup/whitespace.
    this.textMeasureEl_.appendChild(doc.createTextNode(text));
    return {width: this.textMeasureEl_.offsetWidth};
  };

  /******** STUBS ********/
  contextPrototype.clip = function() {
    // TODO: Implement
  };

  contextPrototype.arcTo = function() {
    // TODO: Implement
  };

  contextPrototype.createPattern = function(image, repetition) {
    return new CanvasPattern_(image, repetition);
  };

  // Gradient / Pattern Stubs
  function CanvasGradient_(aType) {
    this.type_ = aType;
    this.x0_ = 0;
    this.y0_ = 0;
    this.r0_ = 0;
    this.x1_ = 0;
    this.y1_ = 0;
    this.r1_ = 0;
    this.colors_ = [];
  }

  CanvasGradient_.prototype.addColorStop = function(aOffset, aColor) {
    aColor = processStyle(aColor);
    this.colors_.push({offset: aOffset,
                       color: aColor.color,
                       alpha: aColor.alpha});
  };

  function CanvasPattern_(image, repetition) {
    assertImageIsValid(image);
    switch (repetition) {
      case 'repeat':
      case null:
      case '':
        this.repetition_ = 'repeat';
        break
      case 'repeat-x':
      case 'repeat-y':
      case 'no-repeat':
        this.repetition_ = repetition;
        break;
      default:
        throwException('SYNTAX_ERR');
    }

    this.src_ = image.src;
    this.width_ = image.width;
    this.height_ = image.height;
  }

  function throwException(s) {
    throw new DOMException_(s);
  }

  function assertImageIsValid(img) {
    if (!img || img.nodeType != 1 || img.tagName != 'IMG') {
      throwException('TYPE_MISMATCH_ERR');
    }
    if (img.readyState != 'complete') {
      throwException('INVALID_STATE_ERR');
    }
  }

  function DOMException_(s) {
    this.code = this[s];
    this.message = s +': DOM Exception ' + this.code;
  }
  var p = DOMException_.prototype = new Error;
  p.INDEX_SIZE_ERR = 1;
  p.DOMSTRING_SIZE_ERR = 2;
  p.HIERARCHY_REQUEST_ERR = 3;
  p.WRONG_DOCUMENT_ERR = 4;
  p.INVALID_CHARACTER_ERR = 5;
  p.NO_DATA_ALLOWED_ERR = 6;
  p.NO_MODIFICATION_ALLOWED_ERR = 7;
  p.NOT_FOUND_ERR = 8;
  p.NOT_SUPPORTED_ERR = 9;
  p.INUSE_ATTRIBUTE_ERR = 10;
  p.INVALID_STATE_ERR = 11;
  p.SYNTAX_ERR = 12;
  p.INVALID_MODIFICATION_ERR = 13;
  p.NAMESPACE_ERR = 14;
  p.INVALID_ACCESS_ERR = 15;
  p.VALIDATION_ERR = 16;
  p.TYPE_MISMATCH_ERR = 17;

  // set up externs
  G_vmlCanvasManager = G_vmlCanvasManager_;
  CanvasRenderingContext2D = CanvasRenderingContext2D_;
  CanvasGradient = CanvasGradient_;
  CanvasPattern = CanvasPattern_;
  DOMException = DOMException_;
})();

} // if
else { // make the canvas test simple by kener.linfeng@gmail.com
    G_vmlCanvasManager = false;
}
return G_vmlCanvasManager;
}); // define
;
/**
 * @module zrender/tool/util
 * @author Kener (@Kener-林峰, kener.linfeng@gmail.com)
 *         Yi Shen(https://github.com/pissang)
 */
define(
    'zrender/tool/util',['require','../dep/excanvas'],function(require) {

        var ArrayProto = Array.prototype;
        var nativeForEach = ArrayProto.forEach;
        var nativeMap = ArrayProto.map;
        var nativeFilter = ArrayProto.filter;

        // 用于处理merge时无法遍历Date等对象的问题
        var BUILTIN_OBJECT = {
            '[object Function]': 1,
            '[object RegExp]': 1,
            '[object Date]': 1,
            '[object Error]': 1,
            '[object CanvasGradient]': 1
        };

        var objToString = Object.prototype.toString;

        function isDom(obj) {
            return obj && obj.nodeType === 1
                   && typeof(obj.nodeName) == 'string';
        }

        /**
         * 对一个object进行深度拷贝
         * @memberOf module:zrender/tool/util
         * @param {*} source 需要进行拷贝的对象
         * @return {*} 拷贝后的新对象
         */
        function clone(source) {
            if (typeof source == 'object' && source !== null) {
                var result = source;
                if (source instanceof Array) {
                    result = [];
                    for (var i = 0, len = source.length; i < len; i++) {
                        result[i] = clone(source[i]);
                    }
                }
                else if (
                    !BUILTIN_OBJECT[objToString.call(source)]
                    // 是否为 dom 对象
                    && !isDom(source)
                ) {
                    result = {};
                    for (var key in source) {
                        if (source.hasOwnProperty(key)) {
                            result[key] = clone(source[key]);
                        }
                    }
                }

                return result;
            }

            return source;
        }

        function mergeItem(target, source, key, overwrite) {
            if (source.hasOwnProperty(key)) {
                var targetProp = target[key];
                if (typeof targetProp == 'object'
                    && !BUILTIN_OBJECT[objToString.call(targetProp)]
                    // 是否为 dom 对象
                    && !isDom(targetProp)
                ) {
                    // 如果需要递归覆盖，就递归调用merge
                    merge(
                        target[key],
                        source[key],
                        overwrite
                    );
                }
                else if (overwrite || !(key in target)) {
                    // 否则只处理overwrite为true，或者在目标对象中没有此属性的情况
                    target[key] = source[key];
                }
            }
        }

        /**
         * 合并源对象的属性到目标对象
         * @memberOf module:zrender/tool/util
         * @param {*} target 目标对象
         * @param {*} source 源对象
         * @param {boolean} overwrite 是否覆盖
         */
        function merge(target, source, overwrite) {
            for (var i in source) {
                mergeItem(target, source, i, overwrite);
            }
            
            return target;
        }

        var _ctx;

        function getContext() {
            if (!_ctx) {
                require('../dep/excanvas');
                /* jshint ignore:start */
                if (window['G_vmlCanvasManager']) {
                    var _div = document.createElement('div');
                    _div.style.position = 'absolute';
                    _div.style.top = '-1000px';
                    document.body.appendChild(_div);

                    _ctx = G_vmlCanvasManager.initElement(_div)
                               .getContext('2d');
                }
                else {
                    _ctx = document.createElement('canvas').getContext('2d');
                }
                /* jshint ignore:end */
            }
            return _ctx;
        }

        /**
         * @memberOf module:zrender/tool/util
         * @param {Array} array
         * @param {*} value
         */
        function indexOf(array, value) {
            if (array.indexOf) {
                return array.indexOf(value);
            }
            for (var i = 0, len = array.length; i < len; i++) {
                if (array[i] === value) {
                    return i;
                }
            }
            return -1;
        }

        /**
         * 构造类继承关系
         * @memberOf module:zrender/tool/util
         * @param {Function} clazz 源类
         * @param {Function} baseClazz 基类
         */
        function inherits(clazz, baseClazz) {
            var clazzPrototype = clazz.prototype;
            function F() {}
            F.prototype = baseClazz.prototype;
            clazz.prototype = new F();

            for (var prop in clazzPrototype) {
                clazz.prototype[prop] = clazzPrototype[prop];
            }
            clazz.constructor = clazz;
        }

        /**
         * 数组或对象遍历
         * @memberOf module:zrender/tool/util
         * @param {Object|Array} obj
         * @param {Function} cb
         * @param {*} [context]
         */
        function each(obj, cb, context) {
            if (!(obj && cb)) {
                return;
            }
            if (obj.forEach && obj.forEach === nativeForEach) {
                obj.forEach(cb, context);
            }
            else if (obj.length === +obj.length) {
                for (var i = 0, len = obj.length; i < len; i++) {
                    cb.call(context, obj[i], i, obj);
                }
            }
            else {
                for (var key in obj) {
                    if (obj.hasOwnProperty(key)) {
                        cb.call(context, obj[key], key, obj);
                    }
                }
            }
        }

        /**
         * 数组映射
         * @memberOf module:zrender/tool/util
         * @param {Array} obj
         * @param {Function} cb
         * @param {*} [context]
         * @return {Array}
         */
        function map(obj, cb, context) {
            if (!(obj && cb)) {
                return;
            }
            if (obj.map && obj.map === nativeMap) {
                return obj.map(cb, context);
            }
            else {
                var result = [];
                for (var i = 0, len = obj.length; i < len; i++) {
                    result.push(cb.call(context, obj[i], i, obj));
                }
                return result;
            }
        }

        /**
         * 数组过滤
         * @memberOf module:zrender/tool/util
         * @param {Array} obj
         * @param {Function} cb
         * @param {*} [context]
         * @return {Array}
         */
        function filter(obj, cb, context) {
            if (!(obj && cb)) {
                return;
            }
            if (obj.filter && obj.filter === nativeFilter) {
                return obj.filter(cb, context);
            }
            else {
                var result = [];
                for (var i = 0, len = obj.length; i < len; i++) {
                    if (cb.call(context, obj[i], i, obj)) {
                        result.push(obj[i]);
                    }
                }
                return result;
            }
        }

        function bind(func, context) {
            
            return function () {
                func.apply(context, arguments);
            }
        }

        return {
            inherits: inherits,
            clone: clone,
            merge: merge,
            getContext: getContext,
            indexOf: indexOf,
            each: each,
            map: map,
            filter: filter,
            bind: bind
        };
    }
);

define('zrender/config',[],function () {
    /**
     * config默认配置项
     * @exports zrender/config
     * @author Kener (@Kener-林峰, kener.linfeng@gmail.com)
     */
    var config = {
        /**
         * @namespace module:zrender/config.EVENT
         */
        EVENT : {
            /**
             * 窗口大小变化
             * @type {string}
             */
            RESIZE : 'resize',
            /**
             * 鼠标按钮被（手指）按下，事件对象是：目标图形元素或空
             * @type {string}
             */
            CLICK : 'click',
            /**
             * 双击事件
             * @type {string}
             */
            DBLCLICK : 'dblclick',
            /**
             * 鼠标滚轮变化，事件对象是：目标图形元素或空
             * @type {string}
             */
            MOUSEWHEEL : 'mousewheel',
            /**
             * 鼠标（手指）被移动，事件对象是：目标图形元素或空
             * @type {string}
             */
            MOUSEMOVE : 'mousemove',
            /**
             * 鼠标移到某图形元素之上，事件对象是：目标图形元素
             * @type {string}
             */
            MOUSEOVER : 'mouseover',
            /**
             * 鼠标从某图形元素移开，事件对象是：目标图形元素
             * @type {string}
             */
            MOUSEOUT : 'mouseout',
            /**
             * 鼠标按钮（手指）被按下，事件对象是：目标图形元素或空
             * @type {string}
             */
            MOUSEDOWN : 'mousedown',
            /**
             * 鼠标按键（手指）被松开，事件对象是：目标图形元素或空
             * @type {string}
             */
            MOUSEUP : 'mouseup',
            /**
             * 全局离开，MOUSEOUT触发比较频繁，一次离开优化绑定
             * @type {string}
             */
            GLOBALOUT : 'globalout',    // 

            // 一次成功元素拖拽的行为事件过程是：
            // dragstart > dragenter > dragover [> dragleave] > drop > dragend
            /**
             * 开始拖拽时触发，事件对象是：被拖拽图形元素
             * @type {string}
             */
            DRAGSTART : 'dragstart',
            /**
             * 拖拽完毕时触发（在drop之后触发），事件对象是：被拖拽图形元素
             * @type {string}
             */
            DRAGEND : 'dragend',
            /**
             * 拖拽图形元素进入目标图形元素时触发，事件对象是：目标图形元素
             * @type {string}
             */
            DRAGENTER : 'dragenter',
            /**
             * 拖拽图形元素在目标图形元素上移动时触发，事件对象是：目标图形元素
             * @type {string}
             */
            DRAGOVER : 'dragover',
            /**
             * 拖拽图形元素离开目标图形元素时触发，事件对象是：目标图形元素
             * @type {string}
             */
            DRAGLEAVE : 'dragleave',
            /**
             * 拖拽图形元素放在目标图形元素内时触发，事件对象是：目标图形元素
             * @type {string}
             */
            DROP : 'drop',
            /**
             * touch end - start < delay is click
             * @type {number}
             */
            touchClickDelay : 300
        },

        elementClassName: 'zr-element',

        // 是否异常捕获
        catchBrushException: false,

        /**
         * debug日志选项：catchBrushException为true下有效
         * 0 : 不生成debug数据，发布用
         * 1 : 异常抛出，调试用
         * 2 : 控制台输出，调试用
         */
        debugMode: 0,

        // retina 屏幕优化
        devicePixelRatio: Math.max(window.devicePixelRatio || 1, 1)
    };
    return config;
});


define(
    'zrender/tool/log',['require','../config'],function (require) {
        var config = require('../config');

        /**
         * @exports zrender/tool/log
         * @author Kener (@Kener-林峰, kener.linfeng@gmail.com)
         */
        return function() {
            if (config.debugMode === 0) {
                return;
            }
            else if (config.debugMode == 1) {
                for (var k in arguments) {
                    throw new Error(arguments[k]);
                }
            }
            else if (config.debugMode > 1) {
                for (var k in arguments) {
                    console.log(arguments[k]);
                }
            }
        };

        /* for debug
        return function(mes) {
            document.getElementById('wrong-message').innerHTML =
                mes + ' ' + (new Date() - 0)
                + '<br/>' 
                + document.getElementById('wrong-message').innerHTML;
        };
        */
    }
);

/**
 * zrender: 生成唯一id
 *
 * @author errorrik (errorrik@gmail.com)
 */

define(
    'zrender/tool/guid',[],function() {
        var idStart = 0x0907;

        return function () {
            return 'zrender__' + (idStart++);
        };
    }
);

/**
 * echarts设备环境识别
 *
 * @desc echarts基于Canvas，纯Javascript图表库，提供直观，生动，可交互，可个性化定制的数据统计图表。
 * @author firede[firede@firede.us]
 * @desc thanks zepto.
 */
define('zrender/tool/env',[],function() {
    // Zepto.js
    // (c) 2010-2013 Thomas Fuchs
    // Zepto.js may be freely distributed under the MIT license.

    function detect(ua) {
        var os = this.os = {};
        var browser = this.browser = {};
        var webkit = ua.match(/Web[kK]it[\/]{0,1}([\d.]+)/);
        var android = ua.match(/(Android);?[\s\/]+([\d.]+)?/);
        var ipad = ua.match(/(iPad).*OS\s([\d_]+)/);
        var ipod = ua.match(/(iPod)(.*OS\s([\d_]+))?/);
        var iphone = !ipad && ua.match(/(iPhone\sOS)\s([\d_]+)/);
        var webos = ua.match(/(webOS|hpwOS)[\s\/]([\d.]+)/);
        var touchpad = webos && ua.match(/TouchPad/);
        var kindle = ua.match(/Kindle\/([\d.]+)/);
        var silk = ua.match(/Silk\/([\d._]+)/);
        var blackberry = ua.match(/(BlackBerry).*Version\/([\d.]+)/);
        var bb10 = ua.match(/(BB10).*Version\/([\d.]+)/);
        var rimtabletos = ua.match(/(RIM\sTablet\sOS)\s([\d.]+)/);
        var playbook = ua.match(/PlayBook/);
        var chrome = ua.match(/Chrome\/([\d.]+)/) || ua.match(/CriOS\/([\d.]+)/);
        var firefox = ua.match(/Firefox\/([\d.]+)/);
        var ie = ua.match(/MSIE ([\d.]+)/);
        var safari = webkit && ua.match(/Mobile\//) && !chrome;
        var webview = ua.match(/(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/) && !chrome;
        var ie = ua.match(/MSIE\s([\d.]+)/);

        // Todo: clean this up with a better OS/browser seperation:
        // - discern (more) between multiple browsers on android
        // - decide if kindle fire in silk mode is android or not
        // - Firefox on Android doesn't specify the Android version
        // - possibly devide in os, device and browser hashes

        if (browser.webkit = !!webkit) browser.version = webkit[1];

        if (android) os.android = true, os.version = android[2];
        if (iphone && !ipod) os.ios = os.iphone = true, os.version = iphone[2].replace(/_/g, '.');
        if (ipad) os.ios = os.ipad = true, os.version = ipad[2].replace(/_/g, '.');
        if (ipod) os.ios = os.ipod = true, os.version = ipod[3] ? ipod[3].replace(/_/g, '.') : null;
        if (webos) os.webos = true, os.version = webos[2];
        if (touchpad) os.touchpad = true;
        if (blackberry) os.blackberry = true, os.version = blackberry[2];
        if (bb10) os.bb10 = true, os.version = bb10[2];
        if (rimtabletos) os.rimtabletos = true, os.version = rimtabletos[2];
        if (playbook) browser.playbook = true;
        if (kindle) os.kindle = true, os.version = kindle[1];
        if (silk) browser.silk = true, browser.version = silk[1];
        if (!silk && os.android && ua.match(/Kindle Fire/)) browser.silk = true;
        if (chrome) browser.chrome = true, browser.version = chrome[1];
        if (firefox) browser.firefox = true, browser.version = firefox[1];
        if (ie) browser.ie = true, browser.version = ie[1];
        if (safari && (ua.match(/Safari/) || !!os.ios)) browser.safari = true;
        if (webview) browser.webview = true;
        if (ie) browser.ie = true, browser.version = ie[1];

        os.tablet = !!(ipad || playbook || (android && !ua.match(/Mobile/)) ||
            (firefox && ua.match(/Tablet/)) || (ie && !ua.match(/Phone/) && ua.match(/Touch/)));
        os.phone  = !!(!os.tablet && !os.ipod && (android || iphone || webos || blackberry || bb10 ||
            (chrome && ua.match(/Android/)) || (chrome && ua.match(/CriOS\/([\d.]+)/)) ||
            (firefox && ua.match(/Mobile/)) || (ie && ua.match(/Touch/))));

        return {
            browser: browser,
            os: os,
            // 原生canvas支持，改极端点了
            // canvasSupported : !(browser.ie && parseFloat(browser.version) < 9)
            canvasSupported : document.createElement('canvas').getContext ? true : false
        };
    }

    return detect(navigator.userAgent);
});
/**
 * 事件扩展
 * @module zrender/mixin/Eventful
 * @author Kener (@Kener-林峰, kener.linfeng@gmail.com)
 *         pissang (https://www.github.com/pissang)
 */
define('zrender/mixin/Eventful',['require'],function (require) {

    /**
     * 事件分发器
     * @alias module:zrender/mixin/Eventful
     * @constructor
     */
    var Eventful = function () {
        this._handlers = {};
    };
    /**
     * 单次触发绑定，dispatch后销毁
     * 
     * @param {string} event 事件名
     * @param {Function} handler 响应函数
     * @param {Object} context
     */
    Eventful.prototype.one = function (event, handler, context) {
        var _h = this._handlers;

        if (!handler || !event) {
            return this;
        }

        if (!_h[event]) {
            _h[event] = [];
        }

        _h[event].push({
            h : handler,
            one : true,
            ctx: context || this
        });

        return this;
    };

    /**
     * 绑定事件
     * @param {string} event 事件名
     * @param {Function} handler 事件处理函数
     * @param {Object} [context]
     */
    Eventful.prototype.bind = function (event, handler, context) {
        var _h = this._handlers;

        if (!handler || !event) {
            return this;
        }

        if (!_h[event]) {
            _h[event] = [];
        }

        _h[event].push({
            h : handler,
            one : false,
            ctx: context || this
        });

        return this;
    };

    /**
     * 解绑事件
     * @param {string} event 事件名
     * @param {Function} [handler] 事件处理函数
     */
    Eventful.prototype.unbind = function (event, handler) {
        var _h = this._handlers;

        if (!event) {
            this._handlers = {};
            return this;
        }

        if (handler) {
            if (_h[event]) {
                var newList = [];
                for (var i = 0, l = _h[event].length; i < l; i++) {
                    if (_h[event][i]['h'] != handler) {
                        newList.push(_h[event][i]);
                    }
                }
                _h[event] = newList;
            }

            if (_h[event] && _h[event].length === 0) {
                delete _h[event];
            }
        }
        else {
            delete _h[event];
        }

        return this;
    };

    /**
     * 事件分发
     * 
     * @param {string} type 事件类型
     */
    Eventful.prototype.dispatch = function (type) {
        if (this._handlers[type]) {
            var args = arguments;
            var argLen = args.length;

            if (argLen > 3) {
                args = Array.prototype.slice.call(args, 1);
            }
            
            var _h = this._handlers[type];
            var len = _h.length;
            for (var i = 0; i < len;) {
                // Optimize advise from backbone
                switch (argLen) {
                    case 1:
                        _h[i]['h'].call(_h[i]['ctx']);
                        break;
                    case 2:
                        _h[i]['h'].call(_h[i]['ctx'], args[1]);
                        break;
                    case 3:
                        _h[i]['h'].call(_h[i]['ctx'], args[1], args[2]);
                        break;
                    default:
                        // have more than 2 given arguments
                        _h[i]['h'].apply(_h[i]['ctx'], args);
                        break;
                }
                
                if (_h[i]['one']) {
                    _h.splice(i, 1);
                    len--;
                }
                else {
                    i++;
                }
            }
        }

        return this;
    };

    /**
     * 带有context的事件分发, 最后一个参数是事件回调的context
     * @param {string} type 事件类型
     */
    Eventful.prototype.dispatchWithContext = function (type) {
        if (this._handlers[type]) {
            var args = arguments;
            var argLen = args.length;

            if (argLen > 4) {
                args = Array.prototype.slice.call(args, 1, args.length - 1);
            }
            var ctx = args[args.length - 1];

            var _h = this._handlers[type];
            var len = _h.length;
            for (var i = 0; i < len;) {
                // Optimize advise from backbone
                switch (argLen) {
                    case 1:
                        _h[i]['h'].call(ctx);
                        break;
                    case 2:
                        _h[i]['h'].call(ctx, args[1]);
                        break;
                    case 3:
                        _h[i]['h'].call(ctx, args[1], args[2]);
                        break;
                    default:
                        // have more than 2 given arguments
                        _h[i]['h'].apply(ctx, args);
                        break;
                }
                
                if (_h[i]['one']) {
                    _h.splice(i, 1);
                    len--;
                }
                else {
                    i++;
                }
            }
        }

        return this;
    };

    // 对象可以通过 onxxxx 绑定事件
    /**
     * @event module:zrender/mixin/Eventful#onclick
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#onmouseover
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#onmouseout
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#onmousemove
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#onmousewheel
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#onmousedown
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#onmouseup
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#ondragstart
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#ondragend
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#ondragenter
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#ondragleave
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#ondragover
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#ondrop
     * @type {Function}
     * @default null
     */
    
    return Eventful;
});

/**
 * 事件辅助类
 * @module zrender/tool/event
 * @author Kener (@Kener-林峰, kener.linfeng@gmail.com)
 */
define(
    'zrender/tool/event',['require','../mixin/Eventful'],function(require) {

        

        var Eventful = require('../mixin/Eventful');

        /**
        * 提取鼠标（手指）x坐标
        * @memberOf module:zrender/tool/event
        * @param  {Event} e 事件.
        * @return {number} 鼠标（手指）x坐标.
        */
        function getX(e) {
            return typeof e.zrenderX != 'undefined' && e.zrenderX
                   || typeof e.offsetX != 'undefined' && e.offsetX
                   || typeof e.layerX != 'undefined' && e.layerX
                   || typeof e.clientX != 'undefined' && e.clientX;
        }

        /**
        * 提取鼠标y坐标
        * @memberOf module:zrender/tool/event
        * @param  {Event} e 事件.
        * @return {number} 鼠标（手指）y坐标.
        */
        function getY(e) {
            return typeof e.zrenderY != 'undefined' && e.zrenderY
                   || typeof e.offsetY != 'undefined' && e.offsetY
                   || typeof e.layerY != 'undefined' && e.layerY
                   || typeof e.clientY != 'undefined' && e.clientY;
        }

        /**
        * 提取鼠标滚轮变化
        * @memberOf module:zrender/tool/event
        * @param  {Event} e 事件.
        * @return {number} 滚轮变化，正值说明滚轮是向上滚动，如果是负值说明滚轮是向下滚动
        */
        function getDelta(e) {
            return typeof e.zrenderDelta != 'undefined' && e.zrenderDelta
                   || typeof e.wheelDelta != 'undefined' && e.wheelDelta
                   || typeof e.detail != 'undefined' && -e.detail;
        }

        /**
         * 停止冒泡和阻止默认行为
         * @memberOf module:zrender/tool/event
         * @method
         * @param {Event} e : event对象
         */
        var stop = typeof window.addEventListener === 'function'
            ? function (e) {
                e.preventDefault();
                e.stopPropagation();
                e.cancelBubble = true;
            }
            : function (e) {
                e.returnValue = false;
                e.cancelBubble = true;
            };
        
        return {
            getX : getX,
            getY : getY,
            getDelta : getDelta,
            stop : stop,
            // 做向上兼容
            Dispatcher : Eventful
        };
    }
);

define(
    'zrender/tool/vector',[],function () {
        var ArrayCtor = typeof Float32Array === 'undefined'
            ? Array
            : Float32Array;

        /**
         * @typedef {Float32Array|Array.<number>} Vector2
         */
        /**
         * 二维向量类
         * @exports zrender/tool/vector
         */
        var vector = {
            /**
             * 创建一个向量
             * @param {number} [x=0]
             * @param {number} [y=0]
             * @return {Vector2}
             */
            create: function (x, y) {
                var out = new ArrayCtor(2);
                out[0] = x || 0;
                out[1] = y || 0;
                return out;
            },

            /**
             * 复制向量数据
             * @param {Vector2} out
             * @param {Vector2} v
             * @return {Vector2}
             */
            copy: function (out, v) {
                out[0] = v[0];
                out[1] = v[1];
                return out;
            },

            /**
             * 克隆一个向量
             * @param {Vector2} v
             * @return {Vector2}
             */
            clone: function (v) {
                var out = new ArrayCtor(2);
                out[0] = v[0];
                out[1] = v[1];
                return out;
            },

            /**
             * 设置向量的两个项
             * @param {Vector2} out
             * @param {number} a
             * @param {number} b
             * @return {Vector2} 结果
             */
            set: function (out, a, b) {
                out[0] = a;
                out[1] = b;
                return out;
            },

            /**
             * 向量相加
             * @param {Vector2} out
             * @param {Vector2} v1
             * @param {Vector2} v2
             */
            add: function (out, v1, v2) {
                out[0] = v1[0] + v2[0];
                out[1] = v1[1] + v2[1];
                return out;
            },

            /**
             * 向量缩放后相加
             * @param {Vector2} out
             * @param {Vector2} v1
             * @param {Vector2} v2
             * @param {number} a
             */
            scaleAndAdd: function (out, v1, v2, a) {
                out[0] = v1[0] + v2[0] * a;
                out[1] = v1[1] + v2[1] * a;
                return out;
            },

            /**
             * 向量相减
             * @param {Vector2} out
             * @param {Vector2} v1
             * @param {Vector2} v2
             */
            sub: function (out, v1, v2) {
                out[0] = v1[0] - v2[0];
                out[1] = v1[1] - v2[1];
                return out;
            },

            /**
             * 向量长度
             * @param {Vector2} v
             * @return {number}
             */
            len: function (v) {
                return Math.sqrt(this.lenSquare(v));
            },

            /**
             * 向量长度平方
             * @param {Vector2} v
             * @return {number}
             */
            lenSquare: function (v) {
                return v[0] * v[0] + v[1] * v[1];
            },

            /**
             * 向量乘法
             * @param {Vector2} out
             * @param {Vector2} v1
             * @param {Vector2} v2
             */
            mul: function (out, v1, v2) {
                out[0] = v1[0] * v2[0];
                out[1] = v1[1] * v2[1];
                return out;
            },

            /**
             * 向量除法
             * @param {Vector2} out
             * @param {Vector2} v1
             * @param {Vector2} v2
             */
            div: function (out, v1, v2) {
                out[0] = v1[0] / v2[0];
                out[1] = v1[1] / v2[1];
                return out;
            },

            /**
             * 向量点乘
             * @param {Vector2} v1
             * @param {Vector2} v2
             * @return {number}
             */
            dot: function (v1, v2) {
                return v1[0] * v2[0] + v1[1] * v2[1];
            },

            /**
             * 向量缩放
             * @param {Vector2} out
             * @param {Vector2} v
             * @param {number} s
             */
            scale: function (out, v, s) {
                out[0] = v[0] * s;
                out[1] = v[1] * s;
                return out;
            },

            /**
             * 向量归一化
             * @param {Vector2} out
             * @param {Vector2} v
             */
            normalize: function (out, v) {
                var d = vector.len(v);
                if (d === 0) {
                    out[0] = 0;
                    out[1] = 0;
                }
                else {
                    out[0] = v[0] / d;
                    out[1] = v[1] / d;
                }
                return out;
            },

            /**
             * 计算向量间距离
             * @param {Vector2} v1
             * @param {Vector2} v2
             * @return {number}
             */
            distance: function (v1, v2) {
                return Math.sqrt(
                    (v1[0] - v2[0]) * (v1[0] - v2[0])
                    + (v1[1] - v2[1]) * (v1[1] - v2[1])
                );
            },

            /**
             * 向量距离平方
             * @param {Vector2} v1
             * @param {Vector2} v2
             * @return {number}
             */
            distanceSquare: function (v1, v2) {
                return (v1[0] - v2[0]) * (v1[0] - v2[0])
                    + (v1[1] - v2[1]) * (v1[1] - v2[1]);
            },

            /**
             * 求负向量
             * @param {Vector2} out
             * @param {Vector2} v
             */
            negate: function (out, v) {
                out[0] = -v[0];
                out[1] = -v[1];
                return out;
            },

            /**
             * 插值两个点
             * @param {Vector2} out
             * @param {Vector2} v1
             * @param {Vector2} v2
             * @param {number} t
             */
            lerp: function (out, v1, v2, t) {
                // var ax = v1[0];
                // var ay = v1[1];
                out[0] = v1[0] + t * (v2[0] - v1[0]);
                out[1] = v1[1] + t * (v2[1] - v1[1]);
                return out;
            },
            
            /**
             * 矩阵左乘向量
             * @param {Vector2} out
             * @param {Vector2} v
             * @param {Vector2} m
             */
            applyTransform: function (out, v, m) {
                var x = v[0];
                var y = v[1];
                out[0] = m[0] * x + m[2] * y + m[4];
                out[1] = m[1] * x + m[3] * y + m[5];
                return out;
            },
            /**
             * 求两个向量最小值
             * @param  {Vector2} out
             * @param  {Vector2} v1
             * @param  {Vector2} v2
             */
            min: function (out, v1, v2) {
                out[0] = Math.min(v1[0], v2[0]);
                out[1] = Math.min(v1[1], v2[1]);
                return out;
            },
            /**
             * 求两个向量最大值
             * @param  {Vector2} out
             * @param  {Vector2} v1
             * @param  {Vector2} v2
             */
            max: function (out, v1, v2) {
                out[0] = Math.max(v1[0], v2[0]);
                out[1] = Math.max(v1[1], v2[1]);
                return out;
            }
        };

        vector.length = vector.len;
        vector.lengthSquare = vector.lenSquare;
        vector.dist = vector.distance;
        vector.distSquare = vector.distanceSquare;
        
        return vector;
    }
);

define(
    'zrender/tool/matrix',[],function () {

        var ArrayCtor = typeof Float32Array === 'undefined'
            ? Array
            : Float32Array;
        /**
         * 3x2矩阵操作类
         * @exports zrender/tool/matrix
         */
        var matrix = {
            /**
             * 创建一个单位矩阵
             * @return {Float32Array|Array.<number>}
             */
            create : function() {
                var out = new ArrayCtor(6);
                matrix.identity(out);
                
                return out;
            },
            /**
             * 设置矩阵为单位矩阵
             * @param {Float32Array|Array.<number>} out
             */
            identity : function(out) {
                out[0] = 1;
                out[1] = 0;
                out[2] = 0;
                out[3] = 1;
                out[4] = 0;
                out[5] = 0;
                return out;
            },
            /**
             * 复制矩阵
             * @param {Float32Array|Array.<number>} out
             * @param {Float32Array|Array.<number>} m
             */
            copy: function(out, m) {
                out[0] = m[0];
                out[1] = m[1];
                out[2] = m[2];
                out[3] = m[3];
                out[4] = m[4];
                out[5] = m[5];
                return out;
            },
            /**
             * 矩阵相乘
             * @param {Float32Array|Array.<number>} out
             * @param {Float32Array|Array.<number>} m1
             * @param {Float32Array|Array.<number>} m2
             */
            mul : function (out, m1, m2) {
                out[0] = m1[0] * m2[0] + m1[2] * m2[1];
                out[1] = m1[1] * m2[0] + m1[3] * m2[1];
                out[2] = m1[0] * m2[2] + m1[2] * m2[3];
                out[3] = m1[1] * m2[2] + m1[3] * m2[3];
                out[4] = m1[0] * m2[4] + m1[2] * m2[5] + m1[4];
                out[5] = m1[1] * m2[4] + m1[3] * m2[5] + m1[5];
                return out;
            },
            /**
             * 平移变换
             * @param {Float32Array|Array.<number>} out
             * @param {Float32Array|Array.<number>} a
             * @param {Float32Array|Array.<number>} v
             */
            translate : function(out, a, v) {
                out[0] = a[0];
                out[1] = a[1];
                out[2] = a[2];
                out[3] = a[3];
                out[4] = a[4] + v[0];
                out[5] = a[5] + v[1];
                return out;
            },
            /**
             * 旋转变换
             * @param {Float32Array|Array.<number>} out
             * @param {Float32Array|Array.<number>} a
             * @param {number} rad
             */
            rotate : function(out, a, rad) {
                var aa = a[0];
                var ac = a[2];
                var atx = a[4];
                var ab = a[1];
                var ad = a[3];
                var aty = a[5];
                var st = Math.sin(rad);
                var ct = Math.cos(rad);

                out[0] = aa * ct + ab * st;
                out[1] = -aa * st + ab * ct;
                out[2] = ac * ct + ad * st;
                out[3] = -ac * st + ct * ad;
                out[4] = ct * atx + st * aty;
                out[5] = ct * aty - st * atx;
                return out;
            },
            /**
             * 缩放变换
             * @param {Float32Array|Array.<number>} out
             * @param {Float32Array|Array.<number>} a
             * @param {Float32Array|Array.<number>} v
             */
            scale : function(out, a, v) {
                var vx = v[0];
                var vy = v[1];
                out[0] = a[0] * vx;
                out[1] = a[1] * vy;
                out[2] = a[2] * vx;
                out[3] = a[3] * vy;
                out[4] = a[4] * vx;
                out[5] = a[5] * vy;
                return out;
            },
            /**
             * 求逆矩阵
             * @param {Float32Array|Array.<number>} out
             * @param {Float32Array|Array.<number>} a
             */
            invert : function(out, a) {
            
                var aa = a[0];
                var ac = a[2];
                var atx = a[4];
                var ab = a[1];
                var ad = a[3];
                var aty = a[5];

                var det = aa * ad - ab * ac;
                if (!det) {
                    return null;
                }
                det = 1.0 / det;

                out[0] = ad * det;
                out[1] = -ab * det;
                out[2] = -ac * det;
                out[3] = aa * det;
                out[4] = (ac * aty - ad * atx) * det;
                out[5] = (ab * atx - aa * aty) * det;
                return out;
            }
        };

        return matrix;
    }
);

/**
 * Handler控制模块
 * @module zrender/Handler
 * @author Kener (@Kener-林峰, kener.linfeng@gmail.com)
 *         errorrik (errorrik@gmail.com)
 *
 */
// TODO mouseover 只触发一次
// 目前的高亮因为每次都需要 addHover 所以不能只是开始的时候触发一次
define(
    'zrender/Handler',['require','./config','./tool/env','./tool/event','./tool/util','./tool/vector','./tool/matrix','./mixin/Eventful'],function (require) {

        

        var config = require('./config');
        var env = require('./tool/env');
        var eventTool = require('./tool/event');
        var util = require('./tool/util');
        var vec2 = require('./tool/vector');
        var mat2d = require('./tool/matrix');
        var EVENT = config.EVENT;

        var Eventful = require('./mixin/Eventful');

        var domHandlerNames = [
            'resize', 'click', 'dblclick',
            'mousewheel', 'mousemove', 'mouseout', 'mouseup', 'mousedown',
            'touchstart', 'touchend', 'touchmove'
        ];

        var isZRenderElement = function (event) {
            // 暂时忽略 IE8-
            if (window.G_vmlCanvasManager) {
                return true;
            }

            event = event || window.event;
            // 进入对象优先~
            var target = event.toElement
                          || event.relatedTarget
                          || event.srcElement
                          || event.target;

            return target && target.className.match(config.elementClassName)
        };

        var domHandlers = {
            /**
             * 窗口大小改变响应函数
             * @inner
             * @param {Event} event
             */
            resize: function (event) {
                event = event || window.event;
                this._lastHover = null;
                this._isMouseDown = 0;
                
                // 分发config.EVENT.RESIZE事件，global
                this.dispatch(EVENT.RESIZE, event);
            },

            /**
             * 点击响应函数
             * @inner
             * @param {Event} event
             */
            click: function (event) {
                if (! isZRenderElement(event)) {
                    return;
                }

                event = this._zrenderEventFixed(event);

                // 分发config.EVENT.CLICK事件
                var _lastHover = this._lastHover;
                if ((_lastHover && _lastHover.clickable)
                    || !_lastHover
                ) {

                    // 判断没有发生拖拽才触发click事件
                    if (this._clickThreshold < 5) {
                        this._dispatchAgency(_lastHover, EVENT.CLICK, event);
                    }
                }

                this._mousemoveHandler(event);
            },
            
            /**
             * 双击响应函数
             * @inner
             * @param {Event} event
             */
            dblclick: function (event) {
                if (! isZRenderElement(event)) {
                    return;
                }

                event = event || window.event;
                event = this._zrenderEventFixed(event);

                // 分发config.EVENT.DBLCLICK事件
                var _lastHover = this._lastHover;
                if ((_lastHover && _lastHover.clickable)
                    || !_lastHover
                ) {

                    // 判断没有发生拖拽才触发dblclick事件
                    if (this._clickThreshold < 5) {
                        this._dispatchAgency(_lastHover, EVENT.DBLCLICK, event);
                    }
                }

                this._mousemoveHandler(event);
            },
            

            /**
             * 鼠标滚轮响应函数
             * @inner
             * @param {Event} event
             */
            mousewheel: function (event) {
                if (! isZRenderElement(event)) {
                    return;
                }

                event = this._zrenderEventFixed(event);

                // http://www.sitepoint.com/html5-javascript-mouse-wheel/
                // https://developer.mozilla.org/en-US/docs/DOM/DOM_event_reference/mousewheel
                var delta = event.wheelDelta // Webkit
                            || -event.detail; // Firefox
                var scale = delta > 0 ? 1.1 : 1 / 1.1;

                var needsRefresh = false;

                var mouseX = this._mouseX;
                var mouseY = this._mouseY;
                this.painter.eachBuildinLayer(function (layer) {
                    var pos = layer.position;
                    if (layer.zoomable) {
                        layer.__zoom = layer.__zoom || 1;
                        var newZoom = layer.__zoom;
                        newZoom *= scale;
                        newZoom = Math.max(
                            Math.min(layer.maxZoom, newZoom),
                            layer.minZoom
                        );
                        scale = newZoom / layer.__zoom;
                        layer.__zoom = newZoom;
                        // Keep the mouse center when scaling
                        pos[0] -= (mouseX - pos[0]) * (scale - 1);
                        pos[1] -= (mouseY - pos[1]) * (scale - 1);
                        layer.scale[0] *= scale;
                        layer.scale[1] *= scale;
                        layer.dirty = true;
                        needsRefresh = true;

                        // Prevent browser default scroll action 
                        eventTool.stop(event);
                    }
                });
                if (needsRefresh) {
                    this.painter.refresh();
                }

                // 分发config.EVENT.MOUSEWHEEL事件
                this._dispatchAgency(this._lastHover, EVENT.MOUSEWHEEL, event);
                this._mousemoveHandler(event);
            },

            /**
             * 鼠标（手指）移动响应函数
             * @inner
             * @param {Event} event
             */
            mousemove: function (event) {
                if (! isZRenderElement(event)) {
                    return;
                }

                if (this.painter.isLoading()) {
                    return;
                }

                event = this._zrenderEventFixed(event);
                this._lastX = this._mouseX;
                this._lastY = this._mouseY;
                this._mouseX = eventTool.getX(event);
                this._mouseY = eventTool.getY(event);
                var dx = this._mouseX - this._lastX;
                var dy = this._mouseY - this._lastY;

                // 可能出现config.EVENT.DRAGSTART事件
                // 避免手抖点击误认为拖拽
                // if (this._mouseX - this._lastX > 1 || this._mouseY - this._lastY > 1) {
                this._processDragStart(event);
                // }
                this._hasfound = 0;
                this._event = event;

                this._iterateAndFindHover();

                // 找到的在迭代函数里做了处理，没找到得在迭代完后处理
                if (!this._hasfound) {
                    // 过滤首次拖拽产生的mouseout和dragLeave
                    if (!this._draggingTarget
                        || (this._lastHover && this._lastHover != this._draggingTarget)
                    ) {
                        // 可能出现config.EVENT.MOUSEOUT事件
                        this._processOutShape(event);

                        // 可能出现config.EVENT.DRAGLEAVE事件
                        this._processDragLeave(event);
                    }

                    this._lastHover = null;
                    this.storage.delHover();
                    this.painter.clearHover();
                }

                // set cursor for root element
                var cursor = 'default';

                // 如果存在拖拽中元素，被拖拽的图形元素最后addHover
                if (this._draggingTarget) {
                    this.storage.drift(this._draggingTarget.id, dx, dy);
                    this._draggingTarget.modSelf();
                    this.storage.addHover(this._draggingTarget);

                    // 拖拽不触发click事件
                    this._clickThreshold++;
                }
                else if (this._isMouseDown) {
                    var needsRefresh = false;
                    // Layer dragging
                    this.painter.eachBuildinLayer(function (layer) {
                        if (layer.panable) {
                            // PENDING
                            cursor = 'move';
                            // Keep the mouse center when scaling
                            layer.position[0] += dx;
                            layer.position[1] += dy;
                            needsRefresh = true;
                            layer.dirty = true;
                        }
                    });
                    if (needsRefresh) {
                        this.painter.refresh();
                    }
                }

                if (this._draggingTarget || (this._hasfound && this._lastHover.draggable)) {
                    cursor = 'move';
                }
                else if (this._hasfound && this._lastHover.clickable) {
                    cursor = 'pointer';
                }
                this.root.style.cursor = cursor;

                // 分发config.EVENT.MOUSEMOVE事件
                this._dispatchAgency(this._lastHover, EVENT.MOUSEMOVE, event);

                if (this._draggingTarget || this._hasfound || this.storage.hasHoverShape()) {
                    this.painter.refreshHover();
                }
            },

            /**
             * 鼠标（手指）离开响应函数
             * @inner
             * @param {Event} event
             */
            mouseout: function (event) {
                if (! isZRenderElement(event)) {
                    return;
                }

                event = this._zrenderEventFixed(event);

                var element = event.toElement || event.relatedTarget;
                if (element != this.root) {
                    while (element && element.nodeType != 9) {
                        // 忽略包含在root中的dom引起的mouseOut
                        if (element == this.root) {
                            this._mousemoveHandler(event);
                            return;
                        }

                        element = element.parentNode;
                    }
                }

                event.zrenderX = this._lastX;
                event.zrenderY = this._lastY;
                this.root.style.cursor = 'default';
                this._isMouseDown = 0;

                this._processOutShape(event);
                this._processDrop(event);
                this._processDragEnd(event);
                if (!this.painter.isLoading()) {
                    this.painter.refreshHover();
                }
                
                this.dispatch(EVENT.GLOBALOUT, event);
            },

            /**
             * 鼠标（手指）按下响应函数
             * @inner
             * @param {Event} event
             */
            mousedown: function (event) {
                if (! isZRenderElement(event)) {
                    return;
                }

                // 重置 clickThreshold
                this._clickThreshold = 0;

                if (this._lastDownButton == 2) {
                    this._lastDownButton = event.button;
                    this._mouseDownTarget = null;
                    // 仅作为关闭右键菜单使用
                    return;
                }

                this._lastMouseDownMoment = new Date();
                event = this._zrenderEventFixed(event);
                this._isMouseDown = 1;

                // 分发config.EVENT.MOUSEDOWN事件
                this._mouseDownTarget = this._lastHover;
                this._dispatchAgency(this._lastHover, EVENT.MOUSEDOWN, event);
                this._lastDownButton = event.button;
            },

            /**
             * 鼠标（手指）抬起响应函数
             * @inner
             * @param {Event} event
             */
            mouseup: function (event) {
                if (! isZRenderElement(event)) {
                    return;
                }

                event = this._zrenderEventFixed(event);
                this.root.style.cursor = 'default';
                this._isMouseDown = 0;
                this._mouseDownTarget = null;

                // 分发config.EVENT.MOUSEUP事件
                this._dispatchAgency(this._lastHover, EVENT.MOUSEUP, event);
                this._processDrop(event);
                this._processDragEnd(event);
            },

            /**
             * Touch开始响应函数
             * @inner
             * @param {Event} event
             */
            touchstart: function (event) {
                if (! isZRenderElement(event)) {
                    return;
                }

                // eventTool.stop(event);// 阻止浏览器默认事件，重要
                event = this._zrenderEventFixed(event, true);
                this._lastTouchMoment = new Date();

                // 平板补充一次findHover
                this._mobileFindFixed(event);
                this._mousedownHandler(event);
            },

            /**
             * Touch移动响应函数
             * @inner
             * @param {Event} event
             */
            touchmove: function (event) {
                if (! isZRenderElement(event)) {
                    return;
                }

                event = this._zrenderEventFixed(event, true);
                this._mousemoveHandler(event);
                if (this._isDragging) {
                    eventTool.stop(event);// 阻止浏览器默认事件，重要
                }
            },

            /**
             * Touch结束响应函数
             * @inner
             * @param {Event} event
             */
            touchend: function (event) {
                if (! isZRenderElement(event)) {
                    return;
                }

                // eventTool.stop(event);// 阻止浏览器默认事件，重要
                event = this._zrenderEventFixed(event, true);
                this._mouseupHandler(event);
                
                var now = new Date();
                if (now - this._lastTouchMoment < EVENT.touchClickDelay) {
                    this._mobileFindFixed(event);
                    this._clickHandler(event);
                    if (now - this._lastClickMoment < EVENT.touchClickDelay / 2) {
                        this._dblclickHandler(event);
                        if (this._lastHover && this._lastHover.clickable) {
                            eventTool.stop(event);// 阻止浏览器默认事件，重要
                        }
                    }
                    this._lastClickMoment = now;
                }
                this.painter.clearHover();
            }
        };

        /**
         * bind一个参数的function
         * 
         * @inner
         * @param {Function} handler 要bind的function
         * @param {Object} context 运行时this环境
         * @return {Function}
         */
        function bind1Arg(handler, context) {
            return function (e) {
                return handler.call(context, e);
            };
        }
        /**function bind2Arg(handler, context) {
            return function (arg1, arg2) {
                return handler.call(context, arg1, arg2);
            };
        }*/

        function bind3Arg(handler, context) {
            return function (arg1, arg2, arg3) {
                return handler.call(context, arg1, arg2, arg3);
            };
        }
        /**
         * 为控制类实例初始化dom 事件处理函数
         * 
         * @inner
         * @param {module:zrender/Handler} instance 控制类实例
         */
        function initDomHandler(instance) {
            var len = domHandlerNames.length;
            while (len--) {
                var name = domHandlerNames[len];
                instance['_' + name + 'Handler'] = bind1Arg(domHandlers[name], instance);
            }
        }

        /**
         * @alias module:zrender/Handler
         * @constructor
         * @extends module:zrender/mixin/Eventful
         * @param {HTMLElement} root 绘图区域
         * @param {module:zrender/Storage} storage Storage实例
         * @param {module:zrender/Painter} painter Painter实例
         */
        var Handler = function(root, storage, painter) {
            // 添加事件分发器特性
            Eventful.call(this);

            this.root = root;
            this.storage = storage;
            this.painter = painter;

            // 各种事件标识的私有变量
            // this._hasfound = false;              //是否找到hover图形元素
            // this._lastHover = null;              //最后一个hover图形元素
            // this._mouseDownTarget = null;
            // this._draggingTarget = null;         //当前被拖拽的图形元素
            // this._isMouseDown = false;
            // this._isDragging = false;
            // this._lastMouseDownMoment;
            // this._lastTouchMoment;
            // this._lastDownButton;

            this._lastX = 
            this._lastY = 
            this._mouseX = 
            this._mouseY = 0;

            this._findHover = bind3Arg(findHover, this);
            this._domHover = painter.getDomHover();
            initDomHandler(this);

            // 初始化，事件绑定，支持的所有事件都由如下原生事件计算得来
            if (window.addEventListener) {
                window.addEventListener('resize', this._resizeHandler);
                
                if (env.os.tablet || env.os.phone) {
                    // mobile支持
                    root.addEventListener('touchstart', this._touchstartHandler);
                    root.addEventListener('touchmove', this._touchmoveHandler);
                    root.addEventListener('touchend', this._touchendHandler);
                }
                else {
                    // mobile的click/move/up/down自己模拟
                    root.addEventListener('click', this._clickHandler);
                    root.addEventListener('dblclick', this._dblclickHandler);
                    root.addEventListener('mousewheel', this._mousewheelHandler);
                    root.addEventListener('mousemove', this._mousemoveHandler);
                    root.addEventListener('mousedown', this._mousedownHandler);
                    root.addEventListener('mouseup', this._mouseupHandler);
                } 
                root.addEventListener('DOMMouseScroll', this._mousewheelHandler);
                root.addEventListener('mouseout', this._mouseoutHandler);
            }
            else {
                window.attachEvent('onresize', this._resizeHandler);

                root.attachEvent('onclick', this._clickHandler);
                //root.attachEvent('ondblclick ', this._dblclickHandler);
                root.ondblclick = this._dblclickHandler;
                root.attachEvent('onmousewheel', this._mousewheelHandler);
                root.attachEvent('onmousemove', this._mousemoveHandler);
                root.attachEvent('onmouseout', this._mouseoutHandler);
                root.attachEvent('onmousedown', this._mousedownHandler);
                root.attachEvent('onmouseup', this._mouseupHandler);
            }
        };

        /**
         * 自定义事件绑定
         * @param {string} eventName 事件名称，resize，hover，drag，etc~
         * @param {Function} handler 响应函数
         * @param {Object} [context] 响应函数
         */
        Handler.prototype.on = function (eventName, handler, context) {
            this.bind(eventName, handler, context);
            return this;
        };

        /**
     
// * 自定义事件解绑

// C// Cop@param {string} eventName 06 Goo名称，resize，hover，drag，etc~c.
//
// Licensed unFunction} handler 响应函数c.
//
// Li/c.
//
// Hcompli.prototype.un = fexcept  (Apache Li,n compli) {c.
//
// L   this.unbind//
//   http://www.a;che.org/licenreturnnses/quired by };
c.
//
// /**c.
//
// Lic06 Googl��nc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this fileApach=e ApachArgs Apach domense, V��象 License.
// You may obtain a copy of ttrigger License at
//
//   http express apache.org/licenswitch
//
//   htapache.org/licenrns case EVENT.RESIZE:/
// * Patterns only supportCLICKt.
// * Radial gradient are nDBLot implemented. The VML version ofMOUSEWHEELook very
//   different from the cMOVat.
// * Radial gradient are nthe cDOWNemented.
// * Coordsize. The widthUPemented.
// * Coordsize. The widthOUTt.
// * Radial graicenses/['_' + Apache Lic+ 'obtain ']//
//  undequired by appls width/breakquired by appl}r agreed to in writing, software
// 释放，gle In所�006 Goo License.
// You may obtain a copy of tdispose License at
/apache.org/licenvar root =nses/Lwww.o in writinpps/if (window.removeEpachListenw.apache.org/licening nt-work/#the-doctype)
//  ('.0 (th',nses/L_.0 (thobtain )pecs/web-apps/cps/curreenv.os.tablet ||  * Non phons:
//
// * Patterns oiting/ mobile支持.
// * Canvas width/hwww.r from WebFX
//   (htttouchstartbfx.eae.n.

// AMD ml/boxsizi// * Canvas width/hroom for speed improvements.

//the-by kener.linfethe-ail.com
define('zrender/dep/excanvas',['require'],function(reendby kener.linfeendail.com
define('zrender/deng content
(functielset correctly scale strokes.
// * 的clickyrig��模拟efine('zrender/dep/excanvas',['require'],functie (cobfx.eae.ne (coail.com
define('zrender/dep/excanvas',['require'],functidblvar ms = m.sin  // thiail.com
define('zrender/dep/excanvas',['require'],functimousewheelbfx.eae.nIE_VERSION pixel precision
  var Z = 10;
  var Z2 = Z / 2;

  var IE_VEquire) {
    n is assi pixel precision
  var Z = 10;
  var Z2 = Z / 2;

  var IE_VEdowngned to the <c
    pixel precision
  var Z = 10;
  var Z2 = Z / 2;

  var IE_VEupgned to the <cupateElement('canvas').getContext) {

(functiooom for speed improvementsDOMME_VEScrolN = +navigator.userAgent.match(/MSIE ([\d.]+)?
  var Z2 = Z / 2;

  var IE_VEou by kener.turned fail.com
define('zrendentext) {

(funn() {

  // alias some nt-workdetachdocty('onp://webfx.eae.net/dhtml/boxsizing/boxsizing.htmloom fxample:
   *
  var ms = m.sin;
  var mc = m.cos;
  var abs =ll do f.call(obj,   // this is used for sub pixel precision
  var Z =ll do f.call(obj, a,IE_VERSION = +navigator.userAgent.match(/MSIE ([\d.]+)?t should act as this whenassigned to the <canvas> elements as element.gett should act as this whend function will always use the
   * passed that should act as this when
   * @return {CanvasRenderingContext2D_}
   */
t should act as this whenn this.context_ ||
        (this.context}ecs/web-apps/ctwg.org/s =ly(obj, a.concat(s_domHicen.call(arguments)));
storage.call(arguments)));
paint permnulldefine('zrendeche.org/licenses/LIC(
define('zrto in writing, software
// 拖拽开始c.
//
// Licc.
//
// Licenrivatec.
//
// Licensed unObjecte Apachcense, Ve the License for the specific language gove_processDragSAMD  License at
//
//  HTML5
//   (http://_last};
  }
s)));
 (doc, 'g_pecs/web-apps/curre)));
 isr sliDownefine('zrender/de&&ce(doc, 'g_ace(doc, 'g_o_', 'urn:schemas-.);
/gnifoace(doc, 'g_o_', 'ur!)));
      ingTargetace(doc, 'g_o_', 'urtion will amesple she ==rn:schemas-microsoft-com or use Box Sizing B//ace(doc点击生效时长阀门，某些场景需要降低ce(doc敏感度efine('zrender/deurre:office');

   EnnifoTime 'urefine('zrender/dep/exnew Date() -l_', 'urn:saddNamespMomaces<e:office');

   den;' +
  efine('zrender/deot correctly scale strokicablent('canvas').getContefine('zrender/despace one style she x_canvas_'])define('zrender/dely add one style shet(do one style she
  var G_vmlCanvasManageiddNam sty = 1zing/boxsizing.htmlfunction(opt_do.invisibl/   true
  var G_vmlCanvasManagHtmlAtt.mod( a dummy element dizing/boxsizing.html// 分发config.ion of RAGSTARTw the canvas usiguments)));
  ispatchAgency(efine('zrender/dep/exfunction(opt_do,efine('zrender/dep/ex  doc.attachEveon(doc) {
      // finApachx;height:150px}';

  var G_vmlCanvasManagrn Stri.refresh, '&quot;'); using content-box by default. IE in
//  ce(doc进入目标元素ix, urn) {
    if (!doc.namespaces[prefix]) {
      doc.namespaces.add(prefix, urn, '#default#VML');
    }
  }

  function addNamEString(ndStylesheet(doc) {
    addName:vml');
   one style shess = doc.createStyleSheanvas');
      doc.attaENTERnt('onreadystatechange', bind(this.init_, this, doc));
    },

  _', 'urn:schemaon(doc) {
      // find all canv* makements
      var els = doc.on(doc) {
      // finly add one style sheet per document
 the
   * passed in {@code
  }

  function addNamespace(doc,��  },

    /*上移动ix, urn) {
    if (!doc.namespaces[prefix]) {
      doc.namespaces.add(prefix, urn, '#default#VML');
    }
  }

  function addNamO'g_vmlfore the page is
     * loaded but if you are creating elements using createElement you need to
     OVake sure this is called on the element.
     * @param {HTMLElement} el The canvas element to initialize.
     * @rll e {HTMLElement} the element that was created.
     */
    initElement: function(el) {
      if (!el.getContext) {
        el.getContext = getCont离开  },

    /**
     * Public initializes a canvas element so that it can be used as canvas
     * element from now on. This is called automatiLeav/   doctype toage is
     * loaded but if you are creating elements using createElement you need to
     LEAVEe sure this is called on the element.
     * @param {HTMLElement} el The canvas element to initialize.
     * @rdth = {HTMLElement} the element that was created.
     */
    initElement: function(el) {
      if (!el.getContext) {
        el.getContext = getContext;

        // A完成ix, urn) {
    if (!doc.namespaces[prefix]) {
      doc.namespaces.add(prefix, urn, '#default#VML');
    }
  }

  function addNopcontent. There is no way to hide text nodes so we
        // just remove all cif you are creating t so that IE falsl allow canvas elements to be
      nge(e) {
    var el =     ('canvas');
      for (var i = 0; i < eldoc.createElement('canvas');
      doc.atOPe sure this is called on the element.
     * @param {HTMLElement} el The canvas element to initialize.
     * OP

        // do not use inline function because that will leak memory
        el.attachEvent('onpropertychange', onPropertyChange);
        el.at���e shorter
 ublic initializes a canvas element so that it can be used as canvas
     * element from now on. This is called automaticad before the page is
     * loaded but if you are creating elements using createElement you need to
     * De sure this is called on the element.
     * @param {HTMLElement} el Th init_: function(doc) {
      // find all canvENDements
      var els = doc.getElementsByTagNamegetContext().clearRecte(doc, 'g_vmls).replace(/&/g, 'pply(obj, a.concat(st_doc || docum0.getContext().Manager_ = {
    init: s).replace(/&/-box by default. IE in
//   ��,

 �� 'ex��图形     // Add namespaces and stylesheet to document of the element.
        addNamespacesAndStylesheet(el.ownerDocument);

        // Remove fack ShapeStyle and coordsize
          // eeElement you need to
 ight sl elements and remove
, bind(this.init_, th el The canvas e and height s'';
= doc. '&quot;');
  }

  function addNamespa     [ttachE1, 0],
      [0, 0];
  }

  function matrixMultiply(m1, m2) {
    var result = createMatrixIdentity();

    for (var x = 0; x < 3; x++) {
      ut (var y = 0; y < 3; y++) {
        var sum = 0;

        for (var zUent('onreadystatecha        sum += m1[x][z] * m2[z][y];
        }

   UT  result[x][y] = sum;
      }
    }
    returense, Vnvas'代理l.firstChild.style.height = el.clientHeight + 'px';
        te she (var   },

 nction copyState(o1, o2ensed under the Apache License, Versioes[prefix]) {
      doc.namespaces.add(prefix, urn, '#def {
      doc.na=}  one ed (var ce(doc06 Goo特有，当前被ce(doc,nction copyState(o1, oault#VML');
    }
  }

  func(this.init_, tcontent. Thertyle;
    o  resullimitations,    o2.scaleX HTML5
//   (http://Apachobtain  = 'on.
// * Painti.getContext().uamarine:Packnit: tion onPropertyChanype : Apache Lion(doc) {
      //spaces  blackon(doc) {
      //tyle;
 :Style;
    oon(doc) {
      //cancelBubble:nt;

 [i * 16 + j] = (var j = 0; j uamarlIE wyle;
    opecs/web-apps/curreiquewhite: '#FAEBD7',
    aqlanchedalF5DC',

    e   i   o2.scaleXx[i * 16 + j] = i.toString(16while (el2691E',
    coral: '#l[rine: '#7FFF]     // default si&&oordsiz50',
  ,
    burlyw =   cyan: '#00FFFF008B',
    d)l.getContext().cleael yours.innd
// limitations '#B886 (var j = 0; j < 16,
   el.parenoc) {
      var docng/boxsizing.html)
// 8B',
    darkcyan: '#00ot correctly scale strokeight should is usissed in {@code objt startup.
  ad:vml'yle;
    oelements using createEle��泡到顶级 zrendliane the License fng.html)
//!8B008B',
    darkolivegreen: '#556B2F',
    darkses/L9A9A9',
    darkgreen: '#006400',
 '#FF8C00',
    darkorchid: '#99n {@code obj} as tebluocolate: '#D2691E',
    coral: 'Shee��Licen  },

d = ��ce(doc,e the    ��生tX;
    o2.sstartup.
  addNamespaeveObj
    bisque: '#FFE4C4E4C4',
   black: '#000000',
    blanclanchedal  blackuoise: '#00CED1',
.getContext().clearRect9A9A9',
    darkgreen: Objrquoise: '#00CED1',eElement tX;
    �用户yright 20层getContext().clearRect();
    eachOtherLayer(cense at
/l  hoot correctly scale strok:vml'ypeofF0FFF0cyan: '#00FFFF)'ex_'cense at'ot correctly scale strokFF0'anred: '#CD5C5C',
 #8B0    gold: '#FFD700',
 etContext) {

(functio69B4',
 0FFF0 ghostwhi0082',
    ivory: '#FFFFF0',
     ghostwhite: '#F8F8FF',
    gold: '#FFD700',
 etContext) {

(functio}     if (!el.getContext) {
        el.getContext = g迭代寻找Licen s(var   if (!doc.namespaces[prefix]) {method;
    o2.lineScale_    = o1.lineScale_;
iterateAndFind, 'g_vmlneydew: 'o HTML5
//   (http://invTransform = mat2d.crex150 quired by applicable green: '#20B2AA',
    lig#5F9EA0'lis.whatwg.oto be
  e;
    ope)
slategray: '#778#5F9EA0'cur  daZLevereplace(/&/g, 'FFFE0',
    lim   hoquoise: '#00CED1',p://tm).se[ 0, 0 ]quoise: '#00CED1',for (htsky =  lig.length - 1; i >= 0 ; i--ot correctly scale strokp://en: 'diumblu[i] (var j = 0; j < 1669B4',
     limegreen !==mpurpl.zlreen0082',
    ivory: '#FFFFF0',: '#FAF0E6',vml_', ' (var i geF0E6',(slateblue: ',reen: '#00FA9
define('zrender/dep/exicensmp[0]vml_', 'uIE_VEXred: '#C71585',
    midnightbl1e: '#191970',
 YB',
    mediumseagreen:een: '#3CB371',   ho.needue: '#87C0082',
    ivory: '#FFFFF0',oliv',
   invert(yblue: '#87C   mediumviole.tDEAD',
  red: '#C71585',
    midnig  medec2.applyue: '#87C(tmp,ghtb,kyblue: '#87Cered: '#FF4500',
    orchidt: '#9400D3',
chid: '#9932CC',
    dasoft-com:vml');
  f    ligh '#48Drod: [0]: '#FF1])0082',
    ivory: '#FFFFF0',orange: '#FF8C00',
    coral: '#F08080',
    lDEB887',
    cad0',
    lislategray: 'in writing/ .

//指尖错觉的尝试偏移量配置powderblup://MOBILE_TOUCH_OFFSETS    : '#9400D3',
{ x: 10 }on(doc) {
        s-2ndybrown: '#F4A460',
 10, y sandybrown: '#F4A460'y
    sepowderbluDB',
    medrown: '#B��BC8F8F',
       ��向yalblus mo��.

/// Ad��      更好buted w the canvas us;
    }
  }

  func
// * 
   FixnflowndStylesheet(doc) {
    addName; j++) {
      decToHex[i * 16 + j] #191970',
  9A9'pach.eagreen   mintcream: 'se: '#FFE4E1D8BFD8',
    tom1',
    moccasin) + j.spaces8BFD8',  violet: '#EE82EE',
'#FFA07A',
    lighslategray: '#778A',
    mediu0;Only add(doc, 'g_v&& i <wn: '#8B4513',
    sae: '#000; i++lategrey: '#778899',
   offsnit: n: '#8B4513',
    sa[ imaquamarine: '#66CDA 3);
 .x'#000 thistle: '#D+= 1);
    ered: '#FF4500',
  1);
   yvar parts = stylYString.subsyr (var j = 0; j < 16; j++)ke: '#F5F5F5',
    yellowgreen: '#99932CC',
    darkred j++) {
      2691E',
    coral: '#FF7F
    toma: '#191970',
    mintcream: '#F5F '#40E0D0',
  yrose: '#FFE4E1',tcyan: '#E0FFFF',
    lightgoldenrodyellow: '#FAFAD2',
 h thed = '� lightgr#DAA��= o1.scaleY_并即时做些ey: '#696969',
    dod
    if (!doc.ninns-microsoft-) {
      doc.namepurplelAlpha   = o1.globalAlpha;
    onumber} xmp(percent(parts[1]), 0, 1);y;
    o2.lineScale_  cense at

    papayawhip: x, ys
     * loaded but uoise: '#00CED1', case 'width':
          if (!dwidth':
        e'ex_slatebid)blueAD2',
 �� o2.sc  el.atRgb(part上uoise: '#00CED1',|| p = 2 *sSil   *l - q打酱油的路�imgr啥都不nce wi的en: 'may not use}';
    }
  }

  // Add899',
  ;

    switch (e.pt startup.
  aduamarine:vml_', 'ut: '#F5nk: '#FF69B4',
 oRgb(p, C    yl; //lategrey: '#778899',b * 255)];Licennifoategray: '#2F4F4F',
    darksto be
  ad  papayawhiprquoise: '#00CED1',
    darkvioleue: '#00funct是否在 clip (var 中    magenta: '#FF00FF).seslateb    darkkhaki: '#BDB76B'',
    p',
    hotpink: '#FF69B4',
 p. (2 * h <   On else
     ;
  }

  #191970',
  nction will aY)) 082',
    ivory: '#FFFFF0',eEle��经被祖先f (2  掉�OffsetY = ox[Math.floor(r * 255)] +
        decToHex8',
    paleturquoise: '#AFEEE).sep3 * h < 2)
      return mt startup.
  addNam:vml');
  (doc, 'g_v!se if (ategray: '#2F4F4F',
    darkseJoin;
    o2.liordsizeB',
    mediumseagreen:eEle��能出现      el.style.width = attrs.width.nodeValue     str = styleSte runtime  } else if (/^rgb/.test(style= 1;
    }
    lse if (e if (/^rgb/.test(styleString)) {
      var parts = get* make sure this is called o      var str = '#', cally  } else 

    styleString = String(styleStrstr = styleStrfor (var  } else if (/^rgb/.test(sString)) {
      var parts = get    var j = 0; j < 16; j++)emove fallback   } else if (/^rgb/.test(s= 1;
 hasfou    ient;
      // Createicable lill ue: '#00��  r ��中断AD2',
* h;
      decToHex[Math.floor(g ** 255)] +
        decTt startup.
g, software
// 如果存ext;��三方嵌
   ��一些dombuted };
 6 Good = ��  slatSTYLE = ';
   转换  }
��ense, V��标l.firstChild.style.height = el.clientHeightault#VML');
    }
  }

  funceagreendocty  springgreen: '#00FF7F, isT

//s
     * loaded but FD8',
    tom  sprcToHex[Math.floor(r * 255)]ecToHex[Math.floor(9932CC',
    darkre!ternal text style cachelanchedalm8BFD8',hueTnt-workecToHex[Math.floor(s[3];
   }
  969',
优先eturn '#' + de'#FF00FF'  init: FD8',
toEle    ed: '#FF4500',
    orchid: '# hueTFD8',
relatedle sheet per document
 ly;
    try {
      stysrc.style;
    var fontFamily;
    try {
      sty   var (var j = 0; j < 16rkred: '#8    iid fon!ml_', 'u   };
  ot correctly scale strok function percent    ind {
     3);
 X
   'undefined'
    var fontFamily;
    try {
iant || DE?tStyle || DEFA,
      variant: style.fontVariant || DEF  black.0FFF0X),
      variant: style.fontVariant || D+
    }
 || DEFLefoc) {
      var doct(s) / 100;
  }

  fuyle.fontStyle || DEFYULT_STYLE.style,
      variant: style.fontVariant || DEFAULT_STYLE.varYant,
      weight: style.fontWeight || DEFAULT_STYLE.wYight,
      size: style.fontSize || DEFAULT_STYLE.size,Topquoise: '#00CED1',
    darkviolet: '#9400D3',
    dtegrey: '#778899',
   .

// style = e,
  LT_Sntation
i,
      variant: style.fontVarianAULT_STY    }
rnal es[0],
      variant: style.fontVarianFAULT_STchangedle.size = 
        }
       :vml'che[styleString]) {
    (http://wBoRgb docum
    mediumturn fRom fgettyle.sizClientRec lightyellow: '#FFFFEskyblue: '#8 'normal',
    e��屏的reateElement('div'] = {
      style: st.sizeelseentX -(style.siz.l      family: fontFamily || DEFAULT_STYLE.tyle.size = YcanvasFontSiztntSize = parseFloat(element.currentS: '#9400D3',
 r fontStyleCache (parts function processFontStyle(styleStcadetblue: 'util.merge(obtain a copy of , doctyfuln normal tex];
 se if (/^rgbicable obtain tyle.s}
se ig, so* 曲线辅助模块t th@moduleseagreen/tool/curve VML author pissang(https://www.github.com/81;

  )
    LE.sty('   //computedStyle',['require','./vector'],green: '#urn styapacyle.sp://yle +  = urn sty(.style + 'se if (/' ' + stylEPSILON(pare-4 (var jp://THREE_SQRT   vath.sqrt(3;
     p://ONE_THIRD(par / 3 (var j// 临r, g��量 'butt': _v0 =le.weig  lightslategran proc1ssLineCap(lineCap) {
    retur2ssLineCap(lineCap) {
   //  retur3ssLineCap(lineCap) {yle.scense at
isAroRgbZero(va'#7B68EE',
  icable val > -+ style.&&HATWG< + styleand errogContext2D inteNotrface as described by
   * the WHATWG.
+ style.|| {HTMLE   * @pa canvasEleme/ softwcense at
evalCubicCoeff(a, b, c, d,  elements usiicable ((a * t + b)tity();c
    thid canvasEleme*/': 'rou*
    if * 计算alph��贝塞尔值 [];
   @me0, 1Of text.
:   //computedStyle.s0;
    if (h ]), 0, 1);p0.strokeStyle = '#000';
   1.strokeStyle = '#000';
   2.strokeStyle = '#000';
   3.strokeStyle = '#000';
  ;
    v* @icable ), 0, 1).stroke/ You cense at
cnvasAt(p0, p1, p2, p3his.m_ = create'(', nnit: 1in Gtyle.size icable if';
*��软雅(�软雅p0 + 3tity(* p1ight,
      siz+��是';   �是�3��定�     // 2;
     e / .75k_ = [];
    this.currentPath_ = [��数[];

    // Canvas context properties
    this.strokeStyle = '#000';
    this.fillStyle = '#000';

    this.lineWidth = 1;
    this.lineJoin = 'miter';
    this.lineCap = 'butt';
    this.miterLimit = Z * 1;
    this.globalAlpha = Demespaive1;
    // this.font = '10px sans-serif';
    this.font = '12px 微��else {
      v((p  thp0
   if';
+ 2

  p2 el.1
    loneNodeyle.size = ca+ (p3 el.2
    t*
    thi{
      if';
    thi [];
    this.currentPath_ = 方程根，使用盛金公�unctio // Canvas context properties
    this.strokeStyle = '#000';
    this.fillStyle = '#000';

    this.lineWidth = 1;
    this.lineJoin = 'miter';
    this.lineCap = 'butt';
val.strokeStyle = '#Array.<, 0, 1>}slices   this.miterLimit = Z * 7CEE��根数�    sad  this.globalAlpha = 1) {1;
    // this.fontval,eringCapache.org/l// EvaluateeringC ofpha = .globalAlContextans-serar, a  this.tl = el.2 in p
    }
  }
p://b =ull;
      // * 2 +l.cl.element_.innecHTML = ''1  el.cl.element_.inneutedp0 -El_) (var j = 0p://A = b * b -);

 ntitc.element_.inneBthat sac - 9store h = [];
xtMeasurC = c      a���t sadrrent matrix soe Li0 (var j = 0urreterface as deA)slConerface as deBtion hueToRgb(m1,eTo = function(aXbtion hueToRgb(m1, m2,ringClue: '
    }
  }

  ftStyle.fontSize),
        fontSize = parsen li-c / b;tMeat1, t2, t3, b is not zero{
      computedStyle.1    me   i1 <= 1
    }
  }

  // Add name: 'mon++e: '#Style.size = caD1',
    darkviolet: '#9400Da: '#A0522n() {

  // alias s TODOisinPaB * B - 4 * A * Cpecs/web-apps/curre{
    var p =
   tion hueToRgb(m1, m2,p://K this/ A
    magenta: '#FF00FF'rrentb / a + Kp.y;
   };axtPrototype.lineTo = functionparsee';
-K / 2    aCP
  colineTo = function(aX, aY) {
    var p = getCoords(this, aX, aY);
    this.currentPath_.push({type: 'lineTo', xtedStyle.2Y) {
    v2r p = getCoords(this, aX, aY);
    this.cur2quoise: '#00CED1',
    darkviolet: '#9400D3',
    deepp
    > 0lategrey: '#778899',
   
   SqacesAapMap = {
erCur
    magenta: '#FF00FFYn li = pb + 1.5store h(-Bck_ self, c self.currentPath_.push(e';
    type: 'bezierCurve-o',
      cp1x: cp1.x,
     urreY1 <.
  function bezierCur  se({
  -apMappow(-Y1, 'flat',
 ent('canvas').getContext) {

(function() {

  // alias some func({
  entX_ = px;
    self.currentY_ = p.y;
  }

  contextPrototy p.x,2      y: p.y
    });
    self     entX_ = p.x2
    self.currentY_ = p.y;
  }

  contextPrototype.quadraticCurveTo = functie';
CPx, aCPy,n/docs/Canvas_tutorial:Drawing_shapes

    var cp         (-ve/rx,
 + Y2)) / (estor2y: cp2.y,
      x: p.x aY) {
    var p = getCoords(this, aX, aY);
    this.currentPath_.push({type: 'lineTo', x: p.x, y:  obj} as {@code this}.
   *
  }
is.clse)    ty/restore hB / 3.lse)apMap = {
 = p3.0
 60B',
    darkgray: parseheteEl_apMapacos(T / 33
    bezierCurveTo(thiAf, cp1, cp2, p) {A self.currentPath_.push',
   apMap);
 s, cp self.currentPath_.var cp1 = {
      x: this.curren    yf, cp*     / 3.0 * (cp.x - this.current         curr+;
    varlden +}

  var linurrentY_in      a0 / 3.0 * (cp.x - this.current     leme var xStart = aX + -c(aStartAngle) * aRadius - Z2;
    var yStart = aY + ms(aStgetCoords(this, aX, aY);
    var cp1 = getCoords(this, aCP1x, aCP1y);
    var cp2 = getCoords(this, aCP2x, aCP2y);
    bezierCurveTo(this, cp1, cp2, p);
  };

  // Helper function that takes yEnd = a3Y) {
    v3r p = getCoords(this, aX, aY);
    this.cur  contextPrototype.e: 'lineTo', x: p.x, y: p.y});

  icable es and oundColor = '#fff'; //red, I don't know why, i��限值};
 �',
    sad// Canvas context properties
    this.strokeStyle = '#000';
    this.fillStyle = '#000';

    this.lineWidth = 1;
    this.lineJoin = 'miter';
    this.lineCap = pe = CanvasRendeextremaontext2D_.prototype;
  contextPrtype.clearRect = function() {
  Edius: 
    // this.fontadius: = '10px sans-serrHTM6lign 00CDlse)p_ +      s.element_.inneeEl_s ped: pE���ound.yEnd:anch     

  // Help.beginPath = = eld.y});];
  };

  contextProt

  contextPrototype.beziagetCoords(this, aX, aY)ent that the 2currentPath_.push({typis.currentY_ = p- Z2;
    var yEnd = aY + ms(aEndAngl= getCoords(this, aX, aY)adius:  this.currentPath_.push({type: 'lineTo', x: p.x, y: p.y});

    this.currentX_ = p.x;
    tht save/rntY_re has no effeccontextPrototype.bezierCurveTo = function(aCP1);
  };
ue: '     s.cur aStartAngle, aE the already fixed cordinates.
  function bezierCurveTo(self, cp1, cp2, p) {
    self.currentPath_.pushthis.currTo',
      th, aY);
    this.lineTo : 'wa';

    var,
      cp2ath_ = oldPath;
  };

  contX_),
      y: this.currentY_ + 2.0 / 3.0 * (cp);
  };

  contextPrototype.strokeRect = function(this, aCP2x, aCP2y);
    bezierCurveTo(this, cp1,);
  };

  conte

  // Helper function that takes the alrea  var p = getCoords(this, aX, aY);
    var细分d, I don't know  same

    // Canvas context properties
    this.strokeStyle = '#000';
    this.fillStyle = '#000';

    this.lineWidth = 1;
    this.lineJoin = 'miter';
    this.lineCap = 'butt';
    this.m                       rou    this this.globalAlpha = Subdivide
    // this.font ,    = '10px sans-serp0his.c = el.clonee(fa,
              p1
    
    // Use ion(Style.size R0,
 2gle) ound.
    ove+

  cype.createRadial      1    /0          0                1       2und.
1aX1, aY1, 1aR1) {
    var gradi      0_ =w CanaX1, aY1, 0aX0;is.textMeasSeg this.fend)utX + aW,
          ;
  styroent_('gradien;
  2    graaR0;
    gr;
  3;
    re  contextPradient    thiadient;4  };

  contextProt;
  5    gimage, var_args) 6    gmage, var_args) 7    g  conteoundColor = '#fff'投�y: '#��is.currentPath_ = old上s mo��回 we ov距离�'#80808th we overi有ing)) 会drawiant�或者多个 var �里只r oldR其中Width 最短};
  }
��= image.runarts[1]), 0, 1);
 this.fillStyle nt(parts[2mage.runtimeStyle.height x    this.lineWidnt(parts[2riginal size
    var w = x this.lineJoin =nt(parts[2age.height;

    // and rx   this.lineCap nt(parts[2ntimeStyle.width = oldRun
    l amp(percent(parts[2]), 0,dth = 'autpe = CanvasRende[out]h we overi   this.miterLimit = Z * 1;
    this.globalAlpha = Proc.naPointelse {
   x   s0, x1, y1, x2, y2, x3, y3on(doc) {
l; /xtPro0;
    this.textMeas ret://pomaxputedStyio/bezierinfo/#psx = s  this.textMeasuris.font = 'htskybterATWG= 0.005) {
    // TODO: BInfinityR1) {
    v_v0X + aWxR0;
    grw = styro= 0;
      seEle��粗略估计riant:ing)) 的最小Width 的 t [];

    gumentPENDING   if (s =',
    m_turn0;[3];<CD',_tStri0.05apache.org/licen_v1X + aWha = 1;
 = dw;
  sh  = h_  cp1x: cp1.x,
 gumestyroha = 1;
w =     = dhyts[6];
      dw = arveTo(n lineCapMadistSquare(_v0,rgum self.currentPacordi
    = {};

  function prit: foc) {
      var docfloweStyle.size = ca+ aHeight);
    this   sx = sy = 0;
      s// At most 32 '#FFA0iopace(doc, ACD32'
  };


  nten32rt = styleString.indeextPr
      dLElement}styleString]) {
    eight should is using content0, aR0,
 reve.si -];
      
    } else {
    nex
     +
                ' coor aCP',
              dx = arguments[5];
      dy = arguments[l_:g;
      dw = arguments[7];
      dh = arguments[width:'    } else {
      throw Error('Invalid nu1ber n() x[Math.floor(b * l_:gr) {
    }

    var d = getCoords(this,l_:gx, dy);

    var w2 = sw / 2;
    var h2 = sh /  obj} as {@code this}.
   *      W, ',', Z;
      // Create v2ents[5];
      dy = arguments[e="' self.currentPath_.nvasnts[7];
      dh = arguments[this.m_[0][0] != 1 || tveTo(e';
  }

  r('Invalid nu2ts), create them
    some reae="', p =e bogtly  = {};

  function prds(this,e="'define('zrender/dep/exflowe   xStart += 0.125; // Offset xStart n() {

  // alias some funcson that *entsguments[4]; represented in binary
    }

    var p =  aCPght) {
    thPrototype.creat aX1;
    gra];
      dy = arguments[s.m_[0][0] != 1 aY1;
    ];
      dh = arguments[t)   }       'M21=', this.m_console.logason that, i self.curreicable  cp2, p) {
.backgroundColor = '#fff'; //red��次方tPath_ = [];

    // yle = '#000';
    this.fillStyle = '#000';

    this.lineWidth = 1;
    this.lineJoin = 'miter';
    this.miterLimit = Z * 1;
    this.globalAlpquadH =  1;
    // this.ototype.createRadif';
    this.font = '12px 微软雅      // 决�lse)�是改��代价最
  conted to minimize displayed area so that
          this.canvas =don't waste time on unused pixels.
      var max = d;
      var c2 = getCoords(this, dx + dw, dy);
      var c3 = getCoords(this, dx, dy + dh);
      vart('div');
    el.style.css.m_ = createMatrixIlse);(  thi
   dient = fu�代�         on (need to minimize displayed area so that
      why, it  filters don't waste time on unused pixels.
      var max = d;
      var c2 = getCoords(this, dx + dw, dy);
      vatPrototype = CanvasRenderingContext2D_.prototype;
  contextPrototype.clearRect = function()      var  if (this.textMeasl_) {
      this.textMasureEl_ anch xEnd: pE
  contextPrototrHTMlse);
= el.cl contextPrototype.ranch current matrix so, aHeight) {
    this.moveTo(aX, aY);
    this.lineTo(aX + aWidth, aY);
    this.lineTo(aX + aWidth, aY + aHeight);
    this.lineTo(aX, aY + aHei = getCoords(this, aX, aY);
    this.currentPath_.push({type: 'lineTo', x: p.x, y: p.y});

    this.currentX_ = p.x;
    th.currentPath_;
    this.beginPath();

    this.moveTo(aX, aY);
    this.l              ction(aX, aY, aWidth, aHeight) {
    var oldPath = this.currentPath_;
 .y - this.currentY_)
    };
    var cp2 = {
      x: cp1.x + (p.x aHeight);
    this.lineTo(aX, aY + aHeight);
    this.closePath();
    this.stroke();

    this.currentPath_ = oldPath;
  };

  contextPrototype.fillRect = function(aX, aY, aWidth, aHeight) {
    var oldPath = this.currentPath_;
 ds(this, aCP1x, aCP1y);
    var cp2 = getCoords(this, aCP2x, aCP2y);
    bezierCurveTo(this, cp1, cp2, p);
  };

  // Helper function that takes the alrea  var p = getCoords(this, aX, aY);
    var pStartrea stCoords(this, xStart, yS

    // Canvas context properties
    this.strokeStyle = '#000';
    this.fillStyle = '#000';

    this.lineWidth = 1;
    this.liner c3 = getCoords(this, dx, dy + dh);
      var      um
    // thi((dh + sy * dh / gradight  决�      xEnd:ight) {
    thgin="0,0"==.
  function bezie//t = is ceStrinof',
 and    yle.size = canvasFon.m_[1][0] / sp.y});

    this.currentX_ = MatrixId * sc    /igin="0,         ' path=    this.fill();

    thi var lineOpen == oldPath;
  };

  contextPrototype.createLinearGradient = function(aX0, aY0, aX1, aY1) {
    var gradient = new CanvasGradient_('gradient');
    gradient_ = aY0;
    gradient.x1_ = aX1;
    gradient.y1_ = aY1;
        varurn gradient;
  };

  extPrototype.createRadialGradient = function(aX0, aY0, aR0,
                                       adient = new CanvasGradient_(0;
    gradient.x1_ = aX1;
    gradient.y1_ = aY1;
    gradient.r1_ = aR1;
    retuntextPrototype.drawImage = fu
  };

  ge, var_args) nction            mr(p{
    max(max.y, c2.y, c3.y, c4 we overide t null};

    for (va    var oldRuntimeWidth = image.runtimeStyle.width;
    var oldRuntimeHeight = image.runtimeStyle.height;
    image.runtimeStyle.width = 'auto';
    image.runtimeStyle.height = 'auto';

    // get the original size
    var w = image.width;
    var h = image.height;

    // and remove overides
    image.rutimeStyle.width = oldRunteHeight;

    if (arguments.lengout 3) {
      dx = arguments[1];
      dy = arguments[2];
      var sx = sy = 0;
      sw = dw = w;
      sh = d   } else if (arguments.length == 5) {
      dx = arguments[1];
      dy = arguments[2];
      dw = arguments[3];
      dh = arguments[4];
      sx = sy = 0;
      sw = w;
      sh = h;
    } else if (arguments.length == 9) {
      sx = arguments[1];
      sy = arguments[2];
      sw = arguments[3];
      sh = arguments[4];
      dx = arguments[5      var c4 dy = argume6];
      dw = arguments[7      var c4 dh = argume8];
    } else {
      throw Error('Invalid number of arguments');
    }

    var d = getCoords(this, dx, dy);

    var w2 = sw / 2;
    var h2 = sh / 2;

    var vmlStr = [];

    var W = 10;
    var H = 10;

    var scaleX = scaleY = 1;
    
    // For some reason that I've now forgotten, using divs didn't work
    vmlStr.push(' <g_vml_:group',
                ' coordsize="', Z * W, ',', Z * H, '"',
                ' coordorigin="0,0"' ,
 | p.x > max.x) {
       width:', W, 'px;height:', H,        if (min.y == nul);

    // If filters are necessary (rotation exists), create them
    // filters are bog-slow, so only create them if abbsolutely necessary
    // The following check doesn't account for skews (which don't exist
    // in the canvas spec| p.x > max.x) {
       this.m_[0][0] != 1 || this.m_[0]        if (min.y == nul][1] != 1 || this.m_[1][0]) {
      var filter = [];

     va scaleX = this.scaleX_;
     var scaleY = this.scaleY_;
      // Note the 12/21 reversal
      filter.push('M11=', this.m_[0][0] / scaleX, ',',
                  'M12=', this.m_[1][0] / scaleY, ',',
                  'M21=', this.m_[0][1] / scaleX, ',',
                  'M| p.x > max.x) {
       aleY, ',',
                      if (min.y == nul',',
                  'Dy=', mr(d.y / Z), '');

      // Bounding box calculation (need to miiterLimi      lineha = 1;:nt_) {
 ,vasGradient_) {t('div');
       //t('div');
  ODO: Gradients t  if (     //  if (ODO: Gradients t            //       ODO: Gradients turn gradi     //urn gradiODO: Gradients t sx = sy = 0     // sx = sy = 0ODO: Gradie      var c:;

      if ansion = 1;

      iransformed witdient') {
        varansion = 1;

      i  var an       var y0 =ansion = 1;

      i'px;"',
 fillStyle.'px;"',
ansion = 1;

      ifset
           var y1 = fillansion = 1;

      ifactor for offvar p0 = getCoords(ctl};
  ;
ligh get theagreen:;
    s空间 size 类
 et the *= 0.9K//   (@    v-林峰, k//  .linfeng@gmailyle;func    var st1;

     return computedStyle;
  }

  func.ataisInside：   else i区域内部hould Out a non-negative number.��       StylextWidthon-n��算单行文本宽anvasction builtyle=dStyle(style) area return style.stent le.st{
     ' + style .variant + ' ' + size + "pxxtMeasurent ht + ' ' +
        progid:DxImageTrtyleht + ' ' +
   {
    create them
nts[3ct    sh = h;
        var pt        Cach    {  powderblulStyle.x0HeightllStyle.y0_);
        focus =_, fillStyCouString(s.element_.innecus = {
             y: (p0.y - min.y) / TEXT_CACHE_MAcent500
    }
  }

  f);
        foPIy);
    vPI

         linecense at
normalizeRadian(ang 0)
      h++;
   ft =  %=    ex[Math.floor(b * _ / di     y: p.y
    });
   _ / di+ension;
        exp '#DDA0DD',
  icable ft =          ' path="');e[styleString] =��含判�
      retu software
//  if (h < 0)
      h++;1);
    es[prefix]) {
      doc.namelt b ：2.globalumbermp(percent(parts[1]), 0, 1);
     横al',
    weight: 'e.width = oldRunt      ��al',
    weight:     if (s == 0) {
 d be a nyawhip: lt b= l; // achromatic
    } e!s_;
 || !ng.charAt(0) == '#') {
  '#00BF参数或不Optimi类�fix, urn) {loor(r * 255)] +
        decToHex[M  // If there iszoneT,
  se if (3ize)reate them
    p0 =t(do;
  ||rent sgetCone.x0style.width = el.    ��实�ps[0].a可A520��(excanvas].alpha *)则  th��运算work��要是linhe "polyhift + r th{
    addNamespacemathRcable =   // M,
   stops[0].color;
   ex[Math.floor(b * le.font  // When coLT_STYLE.stylecToHex[Math.floor(r * 255)]  // When cle(styleString) {
    if (fontStyslatebbuildPath 'urnctx.isy = 0In    d.
      lineStr.push('<g_vm         tribute is usethodsed, the meanings of opacite / .75;
    } und'
�面 arg��法都行不通�nreadystatecha

// Knox.global:
//
// * Patterns only s'ellipse':,
  Todoxpans�精�    saddle    alpha = parts[3];
  or;
      var opacity1�轮or (va   sto��         ' g_o_:opacty="',trochoid'le values which isn't ) / hght lt b.loc = 10  indd fued: '#FF4500',
    orchid: '#?ocus.yr_ + anvasP concus.y  lightpink  } else if (style.sianvasPat-ern_) {
      if define('zrender/dep/exccable d be a nCircle(.color;
  , _etred: '#C71585',
  // 玫瑰angl="', angle, '"',
               rose' le values which isn't .y;
        lineStr.push('<g_vml_:cus.ymaxill',
                 路径d = ��圆d =  same等-                1aY) {
    var p = defaultt / width * arcScaleX * arcSc +
         ',
    暂].alpha *
  contextPrototype.stroks in ascending order by  interpret it correctly.
      var stops = fillStyle.colors_;
     stops.sort(function(cs1, cs2) {
        return cs1.offset - cs2.offset;
      });

      var length = stops."position:boolean=}s was表示al',
 处ve n, h + 1   // otherw    if (s == 0) {
 rs attribute is used, the meanis.currentX_ = p.x;x.globalAlpha;

      v = +parts[3];
  ��矩    ��则部  o2     mal',
 ��一步,
      // othern(','), '"',
                   ' opaciScal;

    for (var i = ,
               ];
   -{
    le values which isn't ',
    indicus.ycpX2   i/ are reversed.
      lineStr.pusp = -min.y;
        linQ    var ytrokce an u: Z * (aX * m[0][1] + aYcus.yxespac       y[1] +    y: Z * (aX * m[0][1] + aY * m[1cpX2x, pe.savx;
    y: Z * (aX * m[0][1] + aY * m[1]End m[2][1]s, o   y: Z * (aX * m[0][1] + aY * m[1hift     = l; /
    moccasin: '#FFE4B5',ered: '#FF4500',
    orpaleturquoise: '#AFEEE.y;
        linear sh2,
      y: Z * (aX * m[0][1] +* m[1][1] + m[2][1]) - Z2
    };
  };

  contextPrype.save = function() {
    var o = {};
    cop= ctx.m_;= function2this.m_ = this.mStack_.pop();
  is, o);
    this.aStack_.push(o);
    thitack_.push(this.m_);
    this.m_ = matrixll',
                  ({type: 'close'});
  };

hiftetCoords(ctx, aX, aY) {.y;
        linLduce an uction() {
    if (this.aStack_.length) {
      copyState(this.aStack_.pop()turn isFinite(m[0][0]) && isFinite(m[0][1]) &&
        isFinite(m[1][0]) && isFinite(m[1][1]) &&
       折 isFinite(m[2][0]) && isFi' ' + st(m[2][1]);
  }

  function setM(ctx, mP ' + sthis, doc));
    },

  0][1]) &&p = 0pe)
= funct
        isFinite(m[1][0]) && isFinite(m[1][1]) &&
       圆环                     deling(m[2][1]);
  }

  function setM(ctx, mRinge scale.
      // Determinant o       .        r0] * m[1]the area is enlarged by the
      // transformation.    var stops' opacity="',cStr.p(m[2][1]);
  }

  function setM(ctx, meStr.pu   var det = m[0][0] * m[1][1] - m[0][1] * m[1][1] * m[0][1]);
    ctx.scaleY_ = Math.sqrt(m[1][0��extPrototype.translate = fsle + 'usposition="', focus.x, ', AMD A / difocus.y = mc(aRot)urrentYPI / 18
    }
  }

  floor(g * 255)nd(aRot);
    v     [-s,Rot);

    var m1 = [
      [c,  s, 0 stops[le.clockWisharAt(0) == '#') {
      type.= mc(aRot);
-Prototype.red: '#C71585',
    midnig     [-s, c-     [-sply(createMatrixIdentity(), this.m_);
  };

  contextPrototSle +     var det = m[0][0] * m[1][1] - m[0][1] * m[1][0];
     , false);
  };

  contextPrototype., [
      transform = function(m11, tiply(m1, this.transform = function(m11, e area is enlarged by the
      // transformatio��边extPrototype.translate = fpath(m[2][1]);
  }

  function setant ofathpe = aY) {
// Get athe scale.
      // Determinant oftion(m11,ox calmax = ctx.push(this.5)[0][0]) && isFinite(m[0][1]) &&brushobalisFinite(m[1][0]) && isFinite(m[1][1]) &&
    * m[1][1])gon function(aRot) {
 ype.rotta= function(aRot) {
 ty="',iso  * The maxWidth argumale) {
      // Get thegon = ctxf this.m_ m meanings of opacitt(m[1][0ry sme, '"',
                ext function(aRot) {
    var crecturn = fun__     ueToRgb(pgeyle.sifunc
define('zrender/dep/exc  // for width.e.si, false);
  };

  context    ] - le = yetCompuw(this.le = h{
   isFinite(m[1][0]) && isFinite(m[1][1]) &&
        ction                     delectft =  function(aRot) {
 atio���    weight:ount, since nomagon(aX, aY) {
    var m1 = [
      [1,  lineStr = [];

    var fontSty1][1] - m[0][1] * m[1(procesfunctStyle(this.font),
                                           //' size="', w, 'px ', 通过               �

  conxpans�dRun     heig��快work!�是].alpha * ��条 ctx.g}

    r，ellow: '#FAFA��且      colors.push"none" focus=.direc  // otherwise IE won't interpret it correctl    en: '#90EE90',
          doc.namec i < l :    下�fset - cs2.offset;
  .src_, '" />');
       }
    } else {
      var a = processStyle(ctx.fillStyle);
      var color = a.color;
      var opacity = a.alpha * ctx.lobalAlpha;
      lineStr.push('<g_vml_:fill color="', color, '"' color="', color1, '"'gn = 'l0].color;
      var color2 =tStyle    ��ar stoleY * 创建了则
   �
   [m11Prototype.filgn = 'l.begiocus=slategray: '#778               (    default:
nings of opacitom':
   clos m22, lategray: '#778899',
 om':
   "none" focus= functturn processStyleCache[styleString] !2, m21, th = stops.length;
      var col (anglestops[0].color;
      var color2 =y: 0},
ase 'cente is used, the meanings of op   //' size="', w, 'px ', left��offset,
      // otherw(max.x / Z), 'px ' image.ru0" to="', right ,' 0.05"= 'auto'0" to="', right ,' 0.05" drawImage           ' coordsize=               ' filled="', !st.push(thic.
//
// Licensed uht ,' 0.05" ,
                 ' coordsize=:
      case 'top':
        oth = stops.length;
      var color1 = , upd = dw = w;
     .push(this.m_);
    // For some rea.push(thi* W, ',', Z * H, '"',
     var opacity2 = stops[length - 1].alpha * ct_ (an0],
     , m22, 0],
  
    } else {
    _eEl_
    }
  }

  fixed(rHTMx
    }
  }

  f// Quick rec.nachromatic
    } else {
      var q y > y决�_l    ed(3)_ + _light,
      size: ||ixed<3) +-',0,0';

<   v + mkewOffset = mr(d.x / Zx > x + ',0,0';_:ske var skewOffset = mr(d.x / Zx <kew  + mr(d.     );

    lineStr.pushcToHex[Math.floor(r * 255)] +
        decToHex[Math.floor(g *urrex0ediumx= getCoords(this, aX,(3) +(',' +y min "tru-/>',m_[0][0] != 1 || thrHTM"tru* Z);

x;

 y0ath on="true" / The following check doesn't account for skews (whding box calabs(xcode0)ght
_l     't work
    vmlStr.push(' <g_vm',
   _ntit    yvar aHeight);
    tixed(se.simpvar arth o     _    e" string="',
  h('<g_vmsfont:', ennt_.', encodeHtmlAt   //' size="', w, 'px ', is.currentPath_ = old描ly(mrom="', -left ,' 0" to="', right ,' 0.05" ',
                 ' coordsize="100 100" coordorigin="0 0"',
                 ' filled="', !stroke, '" stroked="', !!stroke,
 mage.hei        ' filled="', !strrue);
  };

  contextPrototype.untimeSt        ' filled="', !straY) {
    voked="', !!stroke,
                 '" style="position:absolute;width:1px;height:1px;">');

    if (stroke) {
      appendStroke(this, lineStr);
    } else {
ype.restore = function()  = dw = w;
      sh = dh = h;
    } elseF0',
push(this.m_);
    thisarams.
      appendFill(this, lineStr, {x: -left, y: 0},
                 {x: right, y: fontStyle.size});
    }

    var skewM = m[0][0].toF          m[0][1].toFixed(3) + ',' + m[1][1].toFixed(3) + ',0,0';

    var s,0';

    con font.
      th skewOffset = mr(d.x / Z) + ',' + mr(d.y / Z);

  r(d.y / Z    arkup/white        lineStr.push('<g_vml_:skew on="t" matrix="', st" matrix}
    
   _:skeon't use innerHTML or innerT       ' offset="', skewOffset="', space.
        .textMeasureEl_.appetr, {x: -left, y: 0},
                 {x: right, y: fontStyle.suted= 0;
 .      sx = sy = 0;
      swtHTML('beforeEnd', s);
      this.textMeasureEl_ = telse if (as).rip = function(tyle.size = canvasFondfont:', encodeHtmlAt contextPrototype.fillText  null};

    for (vay, maxWidth) {
    this.drawText_(text, x, y, maxWidth, false);
  };

  contextPrototype.strokeText = function(text, x, y, maxWidth) {
    this.drawText_(text, x, y, maxWidth, true);
  };

  contextPrototype.measureText = function(text) {
                 '" style="position:absolute;width:1px;height:1px;">');

    if (stroke) {
      appendStroke(this, lineStr);
    } else {
2][0]) - Z2,
      y: Z * (aX ',
                       mr(p. = this.element_.lastChild;
    }
    var doc = this.element_.ownerDocument;
    this.textMeasureEl_.innerHTML = '';
    try {
        this.textMeasureEl_.style.font = this.font;
    } catch (ex) {
        // Ignore failures to set to invalid font.
    }
    se innerHTML or innerText because they allow markup/whitespace.easureEl_.appendChild(doc.createTextNode(text));
    return {wieasureEl_.offsetWidth};
  };

  /******** STUBS ********/
  conlip = function() {
    // TODO: Implement
  };

  contextPrototype.arcTo = function() {
 p.xStart), ',', mr(p.yStart), 'aColor.alpha});
  };

  function CanvasPatterepetition) {
    return new CanvasPattern_(image, repetition);
  };

  // Gradient / Pattern Stonte��y, maxWidth) {
    this.drawText_(text, x, y, maclute;width:1px;height:1px;">');c

    if (strole="position:abso60 % 360;
    if (h ht ,' 0.05"Prototype.is[s];
    this.message = s +'     [-sis[s];
    this.messa       of antim1, twi'#DEB887',
  {
    this.code =                 '" style="position:absolute;width:1px;height:1px;">');

    if (stroke) {
  B   appendStroke(this, lineStr);
    } else {
Arrestore = function() cx, ctedS, m12, m21, m22, dx, dyor;
  p.INDEX_transform = fuhis.element_.lastChild;
    }
    var doc = this.element_.ownerDocument;
    this.textMeasureEl_.innerHTML = '';
    try {
        this.textMeasureEl_.spha: aColor.al -= c    sh = h;RR =y p.VAy
    } else {
     p1, cp2, p) {x     + ytmlAnings of opacity an(dpace.
> r)x / Zd
    
< rurrentPath_.push({typere out the c The following check doesn'urre         Prototype.s-r p = DOM)rs aPI       ' coor.font = thiIs a unctio);
      alpha = parts[3];
  RenderingContext2D_;
  CanvasGrr;
  p.INDEX_lategrey: '#778899',
   ',
   e = function(aX, aY) {
    vPrototype.scaht);
        shit_;
  Canturn parseFloat(s)     [-s, cht);
        shi arc // if
else { /leX, ',',
              
}
return G_vmlCanvasManager;Prototype.define
;
/**
 * @module zrender/tool/util
 * @
}); // define
;
/**
 *ext2D_;
  CanvasGrPrototype.s>nt_;
  CanvyleString]) {
         [-s,- shift;
      }

      // We needh - 1].alpha * ct_ / di, cp2, ptan2(y, tring(start + 1,ansion = 2 * fillStyle.r1_ / dimension - shift;
      }

      // We need to sorion = 2>   G_vmlCanv    on = 2 =nt_;
  CanewOffset = mr(d.x / Znsion -     �无法遍历Date等对 = {
 象的问题n);
  };

  // Gradie    var color1 =  the linef thisthe min and max params.
      app
    ll(this, l);
    }

    var ske1:progid:DxIm  var scaleX = sca,  (ant Datee: '#0000CD',
 < lrt = styleString.indexOf('(',xessLt Date[i]-1) {
      computedSp://yion isDom(obj)1{
            return obxn liisDom(obnserj) {
            return obj   && typeof(obj.npe =tyle="', ctx.lineJoin else {
      // TODO: Fix the min and max pa
    }
  }

  // Add namespace will allow canvas elemdarkorchid: '#9932CC',
    da    }
    return processStyleCach    var color1 = .
   RR = 7;
 0;
  p      '[object Error]':  = 1     cx, mr( if (typ+ixed- cy, mr('objecttyle.size = canvasFon(d_;
  *lCan#000dvmlC    r:progid:DxIm
    lineStr.push('<g_vml_:ction(ffset,
      // otherwlength;
      var color1 = lineS = dw = (procesStyle(this.f }

    var d = getCoorx    x
    x]': "tru+ (var �
        var BUIL0';

 =bj &(d.y /vml_:t+ = 0, l right = 0.05;
        break;
      contextay) {
                    result = [];
           eStr.pu = dw = tion clone(source) {
               ';feof sou ';f== 'objAttr && souy0ight,
      size: sty     va
                if (source instance;
  };ay) {
                    result = [];
           , matrixMultiply(m1,        functio.NOT_FOUND_ERR = 8;
  p.NOT_SUPPORTEt_.lastChild;
    }
    var doy: 0},
        _MODIFICATION_ALLOWED_E    if (sour(r    rmin 2 p.NOT_FOUND_ERR = 8;
  p.NOT_SUPPORTED_ERR = 9;
  p/exccanvdy =_);
    this.m_      }
                }
             iply(m1,Width) {
    this.drawTe与',
 vas 
  }��采用 non-ype.leCac docruOMException_.length;
      var color1 = extProtot Date]'      '[object Error]': e.fabjToString = '" /></g_vml_:linewxtPrototype.mov       };

        vF',
NObject.proNotype.toString;

        function isDom(ojj) {
            return obj && obj.nodjType === 1
                   && typeof.nodeName) == 'string';
        }

    Type === 1
           w.prource.ha      // TODO: Fix th function(text, x, y, mF',
it;
      }

      // We need to sorwediumeight) {
  ��贝后的新对象�merge
                    merge(    // For some reaxed(3) +0';

    anvasM) + ','(d.y / Z) CanvasRenderingContext2D = , x: p.x, y: p.y});
    this.urre    urce !(key in target)) {
                    // 否则只处dorigight y
   y0 ? 1 : -Style.size = cail.co_vml_       /�over   &&get[key] = source[x_, Z *eof ncode�
   ) + ce.length; i < len; i_:ske ?     :ource[key],
           und'
  };    ��);
        fomoveNo= [-1,       ) {
      c: '#1dius: 
         
         * cense at
swap                     '" />')',
   ineTo(aX + // if
else { ineTo(aX + aW);
  };
pe === 1
       */
       );

           ' path="');             oveype.r                mesh = dh = h;
      case null:
      ca       m[0][1].toFixed(3) + ',' + m[1][1].toFixed(3) +0';

    vnt.
    }
    // DokewOffset = mr(d.x / Z) + ','(d.y / Z);up/whitesp    this.lip = function() {
    // TODO: Implement�象中没有此属性的情况
 n1) {l
  () {
    //  if (t dh = arguments[tedS     ex[Math.floor(b * jshint iineStr, {x: -left, y: 0},
     , x: p.x, y: p.y});
    this.currentX_ = p.x;
    this.c                  return obn       [aX,rentPath_.push({typn obj _h = _quamarine: '#66CDAA',
    mediualeY = jshintrt = styleString.indexOf( source[key];
    0DB'position="', focus.x, ',    }() {
    // this.m_[1][1] / scaleY, ',',
     textpathok="t_    ) { this.font;
    } catch (ex)   }

    switch(inity1, '"',
         entity(), this.m_);
  };

ger']             y: p.y
    });
    selze is          () {
    //         dh = arguments[ pStart.red: '#C71585',
    midnig
  va(target, s<�盖
       &&  /* jshin> = getCoords(this, aX, aY)s.join(','ce 源对�palegreen: '#98FB98',
    paleturquoise: '#AFEEER = 10_div)
                   }
            re[0]turn _ctx;
        }

        /ule:zrender/tool/util
         * @param {Arry1indexOf(array, value) {
            if (ar1ay.indexOf) {
              paleturquoise: '#AFEEEE'nt('canvas').getContext('2d');
  == tern = CanvasPattern_D700',
    gol成alph��  //��th the License.
(ctx, aX, aY) {
      * @memberOf   oldlace: '#FDF5E6',
    olive调�n in          target[key] = sou Kener (@Kenern(aX, aY) {
    var m1 = [globalAl  * 构造�1继承关系
         * @memberOf modul1:zrend_er/tool/util
         * @param {Function} clazz 源类
         * @承关系
         * @memberOf modul3 / Z)inherits(clazz, baseClazz) {
        ly(createMatrixIdentittion} clazz 源类
   n() {

  // alias some func     }
        �   return -1;
        }

        /**
         * 构造类继承关系
         * @memberOf module:zrender/tool/util
         * @param {Function} clazz 源类
         * @prototype;
            function F() {}
   inherits(clazz, baseClazz) {
        CD853F',
    pink: '#FFC0CB',
    plum: '#DDA0DD',
              (v, min, max) {
    retur                       ove2][0]) - source) {
                m(target, source, i, overwrite);
            }
            
            return target;
         var _ctx;

        function getContext() {
     (!_ctx) {
                require('../dep/excanvas');
                /* jshint ignore:s                 dh = argumenindow['G_vmlCanvasManager']) {
                    var _div = document.createElemtion} clazz �e),
        fontSize = parse             for ('px;"',
  dh = argucp.x - this.currentX_),
 >=
    vght
    vmlStr.push('<div sty.style.position = 'absoluteeturn obj_div)
      var arcScaleY = ctx.scalelue) {
                    document.body.appendChild(_div);

               tElement(_div)
    | p.x > max.x) {
       x = G_vmturn _ctx;
        }

        /         l/util
         * @param {Arr     _ctx = document.createEleue
         */
        functiourrex = G_vm < else {
               * @memberOf modulazz.constructor = clazz;
        }

        /**
         * 数组或对象遍历
         * @memberOf module:tly yr/tool/util
         * @param {Object|Array} obj
         * @param {Function* @param {*} [context]
     clazz.prototype = newn() {

  // alias some func�映射
         * @memberOf module:zrender/tray.indexOf) {
          rray} obj
         * @param {Function}v = document.createEleixIdentity(), this.m_);
  };

  conteativeMder/tool/util
         * @pa

  contextPrototype.stroke = func0;
    gradiTODO

    var W =rc       stroke) {             oveArcTION_ALLOWED_ERR = 7;
  p.NOT_FOUND_ERR = 8;
  p.NOT_SUPPORTEt_.lastChild;
    }
    var do16;
  p.TYPE_MISMATCH理ovvmlCx / y / -tyleCache[styleString('../dep/excanvas');
                /*             = {
   va     rns
  G_vmlCanvasMe: 'moveTo'-rce, overwritp/excanvst, source, xt2D_;
  CanvasGradient = CanvasGradient_;
  CanvasPattern = CanvasPattern_;
  DOMException = DOMExceptionPrototype.scaosition = 'absolutedule zrendesion;
        exp情况
       r;
  p.INDEX_er/tool/util
         * @parray}soure: 'moveT+ c var                   dule:zrender/tool/util
        di,
    magenta: '#FFer-林峰, kener.linfeng@          }
                redarkorchid: '#9932CC',
    darkre test simple by kener.linfeng@gmail.com
    G_vmlCanvasManager = false;
}
return G_vmlCanvasManager;
}); // define
;
/**
 * @module zrender/tool/util
 * @authorEach = ArrayProer-林峰, kener.linfeng@gmail.com)
 *         Yi Shen(https://github.com/pissang)
 */
define(
    'zrender/tool/util',[rits,
           dep/excanvas'],function(require) {

        var ArrayProto = Array.prototype;
        varrop == 'object'
                        }
            }
;
    
    // For sometElement(_divx = G_vmlCanvasManager.inirray} o     >j
         * @param {Functto.forEach;
        var nat_         }
                       if (cb.call(context, obj[i], i, obj)) {rayProto.map;
        var nativeFilte_ / dimension < len     0],
      [0,  aY, 0],
      [0,  0,  1]
    ]; } else {
      var q overlayEerge时无法遍历Date等对象的问题
        var BUILvar BUILTIN_OBJECT = {
            '[object Function]': 1,
      te(m[1][0]) && isFinit        * @param {Function}ansion = 2>ot);

    v     on = 2 *r dimensio1.4];
      dx = arpe="tile"',
          -         }
           value
         */
        functio调�     * @type {string}
   FFC0CB',
    plum: '#DDA0DD',
                        
                if (source instance:
     tem(target, source, key, overwrite) {
            if (source.hasOwnProperty(key)) {
                var tar
   [m11, m12, his.elementetM(this, m, tr             '" />')onfig',[],function ment(ument.h - 1].alpha * ctyype {string}
          tion {string}
           VE : 'mousemove',
          Sub[m11IE will allow canvas p://firstCm = 1will a,[],function etM(this,cale元素
  || 'fill'   // If filters arhasestore            *   res2,
  '* @t    MOUSEOVER :both'string}
          hasFil (an    MOUSEOVER :pe {sover',
            /**
   Prototype.fill =p://www.l
         * @param {*} ta        }
            }
[m11, m12 targetPt = styleString.indexOf('(',seocum[m11, m12_vmlCanvasManager.ini    else eg.drawT or agreed      * @memB     ais 30s��移�tyle="', ctx.lineJoin* 鼠标移�ueToegyle;moked   reMB0082',
    ivory: '#FFFF�objees.
  function bezierCur     * @memClignty = ious         * @type {string} darkslatebl��从査�承关系
         * @memberOf modu�merge
      i, yi,alpha});
 function(text, x, y, mtext]
         * @return {Array}
         sou         * @param {Function} cb
        * @param {*} source �            if (array[i] === value) {
              tion i[pe: '#0000C2mlCanvasManager.initElej && o'globalout',pe === 1
           ��形 鼠标移到�t;

    switch (e.prope       /�事件�&&          MOUdium'AB0082',
    ivory: '#FFFFF0',atio {colr, alntim命令].al��M, + shiftTo, ];
   CtyleT.lineTo = function            ��绘制始拖oRgb��e to��会从该    * oRgb��     pref算�e:zrender/            /**
   * @p会在之后做单独处理所以mage.ru��略* @param {*} [context]
  �事件对�       // dragstart > drageOBALOediu) + ',' +
               // �ediuy              cb.call(c* @param {Function} cb
         * @p

// Kno         MO * @type {string}
      ty="',M function(aRot) {
    v       * FFEF拽图形元素
          */
  
   拽图形元素
          ru: '#CD853F',
    pink: '#ty="',L发，事件对象是：目�元素estore         * @param {Function} cb
�object进行深�,
      variant: style.fontVarian        FFEFD5
   the min and max pl/util
         * @param {Arr peachpuff: '#FFDAB9',
    pe一次离开优化绑定
             * @typeue
         */
        functio       * @return {Array}
     素或空
             * @type {string}
             */
              * @typEUP : 'mouseup',
            /**
             * 全局离标图形元素
             * @type {string}
             */
            DRAGENTER : 'dragenter',
    C       /**
             * 拖拽图形元素在目标图形元素上移动时触发�ype.restore = function() {
    if (th��元素
             * @typp[2     3     4     5]s.aStack_.push(o);
    this.mS;
  p.INUSE_ATTRIBUTE_ERR = */
            DRAGOVER : 'dragover',
            /**
             * 拖拽图形元素离开目标图形元素时触发，事件对象是：目标图形元素
             * @type {string}
             */i in srt < delay is click
             * @type {number}
             */
            [dx,  dy,  1]
    ];

  trixMultiply(createMatrixIdenti*
             * 拖拽图形元素�4�元素
             * @type {stri5g}
             */
            DRAGENTER : 'dragenter',
    Q       /**
             * 拖拽图形元素在目标图形元素上移动时触发�2][0]) - Z2,
      y: Z * (aX * m[0][1] + aY     * @type {number}
             *  touchClickDelay : 300
        },

        elementClassName: 'zr-element',

        // 是否异常捕获
        catchBrushException: false,

        /**
         * debug日志选项：catchBrushException为true下有效
         * 0 : 不生成debug数据，�b, contextrt < delay is click
             * @type {number}
             */}

            re */
        debugMode: 0,

        // retina 屏幕优化
        devicePixe    // 

            // @type {stri3g}
             */
            DRAGENTER : 'dragenter',
    A发，事件对象是：目tool/ut * @param {Array} obfor debug
        return fun,
    p, q��销比n ==��     /**
         * 数组映c    �形元素
             * @typ  meslorDring}
             */
        p://w + ' 'ts) {
                    cop://w   + 'og(arguments[k]);
          (this, cp1, xelRatio: Math.max(window.devi     T**
 * zreRatio || 1, 1)
    };
    re        &              aourcp exALIDATION_ERR =  == 'string';
        * aRadius - Z2ourc     p.TYPE_MISMATCHcolor2, '"',
    �时直接k! 
   ament��拖
    moccasin: '#FFE4B5',
   !�事件婺
             * @type {string}
             */
         ;
          * @param {*} value
  );

            for (var prop in��对象是：被拖拽图形元素
                     * 开始拖      还  vart 20�用
         */
        debution xutil
         * @param {Fun // 一�yil
         * @param {Object|Array} obj
         uments[zr k! 
  scale来) codeScaleY, mage.r也对xg, b��定ray:���styleString] | /></g_vml_:line>      if (typeory /uid',[],function() {
        var i��拽图形元素在目标图形元素上移动时触发�                        }
 ER : 'dragenter',R = 7;
 yfx.eeta)?/);
 his.r err,   thp[7 * @author Kener (@Kener-林峰, kener.linfeng_             */
            DRAGOVER : 'dragover',
            /**
             * 拖拽图形元素离开目标图形元素时触发，事件对象是：目标图形元素
             * @type {string}
             */ram {Function} cbtch(/(Android);?[\s\/]+([\d.]+)?/);
        var ipad = ua.match(/(iPad).*OS\s([\d_]+)/);
        ua.match(/(iPod)(.*OS\s([\d_]+))?/)Mode: 0,

        // retina 屏幕优化
        devicePi              var ipad l/guid',[],function() {
        var i*/
   * aRadius - Z+)/);
        turn function () {
            r    DRAGENTER : 'dragenter',
    z       /**
             * 拖拽图形元素在目标图形元素上移动时触发，事件对象是：目标图形元素
        = dw = ,

        elementClassName: 'zr-element',

        // 是否异常捕获
        catchBrushException: false,

        /**
         * debug日志选项：catchBrushException�程是：
     化绑定
             * @typeorange: '#FF8C00',
    darkorchid: '#99{};
        var web或空
             * @t
             */
            MOUSEUP : 'mouseup',
  
                        source[key],
                   result =      ��/ Very small anglstrokeStyle   = o1.strokeStex[1].toFixedt specify the Android Foe;
    var fy)) {
              60;
        ( defauy devide             '" />')kelorD= 'le+ ':.
//y devideex[Math.floor(b * le.x0_, fillSty[key继承关系
        h('<g_vm) os.android = true // if
else { // make the ca];
      for (var i = 0; i < lengt= os.iphone = tr.s
   create them
    // fowser.webkit = !!webkit)g, '.');
fo+
    t[1];

        if (anar nativeForEach = ArrayPro= 'leE.farsion =').split('\n         ang��元素�       g',[],function () {
    /**
  var o:
   eout',
  prototype.toString;

        ace(/_/g);
    }

is, doc));
    },

   ');
measure
   true,toolxtAlignlue) {
              ace(/ function(el) {
      if (!el.getContext) g, '.');
reHtml     if (ipad) os.        if (iphone &     detProp == 'objecurre++ / width,
          y: >ScaleX * Z;
   ',
    darksalmon: '#E996�存 Quirk                '</ width,
          y: (p0.y - min.y2];
        if (rimtablle.y0_);
      
        if (ipod) os.ios = os.        rimtabletos = rOf module:zrender/tid or not
        // - Firefox o高anvas{displayt specify the Android version
        // - possibly devide in os, device and browser hashes

   {
    if (browser.webkit = !!webkit) browser.version = webkit[1];

        if (android) os {
         true, os.version = android[2];
     ersion = ie[1];
ype;
        var nativeForEach = ArrayPro];
      for (var i = 0; i < length; i++) {
   .');
        f (ipad) os.ios = os.ipad = true, os.version = ipad[2].replace(/_/g, '.');
        if (ipod) os.ios = os.ipod = true, os.version = ipod[3] ? ipod[3].1][0sage'粗暴           * 鼠�{
    = t       if (blackb'国's.blackx, c
    .webos = tr;
        if (ie) b.version = bb10[2];
        iersion = ie[1];
 =Phone/)abletos = true, os.versiot
        };

     ;
        if (playbook) browser.playbook = true;
        if (kindle) os.kt
        };

        width  /= firefox && ua.match(/Mob) browser.silk = true, browser.vext2D = b10 ||
         

define('zceof Canvletos = true,, m21,  :as支持�berry = true, lta / 2;
��改 (angleberry = true, 60;
         :r.ie && parseed : !(browser.ie &&  {
   Float(brow {
   ODO: Gradieanvas支持，改极端���点了
         var targetProvas').getCoxtProtxt ? true : false
    , matr�改极端, matrxt ? true : false
    eStr.p�改极端eStr.pxt ? true : false
    , up�改极端, upxt ? true : false
    line�改极端linext ? true : false
        1,
     }

    ret1,
 document.createElement(ype.restore/mixin/Evenpe.restorext ? true : false
    2][0]) - Z2,
  �改极端2][0]) - Z2,
  
    }

    d error to get the��供变换扩展 VML text.
    //commixin/ue: '#87C// Setize *= 0.981;

  0 / Math.PI;

        // The angle stion buildStyle(st) {
        this._h return style.s.mputedmatrixg} event �yle + ' ' + style scientific notati' ' + styl�件�ht + ' ' +
  vent 事件名) {
    rete.weight + ' ' +
     * @param {F) {
    retori�空= [ediu
        * @pue: '.fonEFA',
rix
    o.fon  var _h = + style.fa5e-5ringContext2D interface as described by
   * the WHATWG.
   * @param {HTMLElement} canvasElement The element that the 2D context should
   * be associated with
   */
  function CanndColor = '#fff'@aliasontext propertie) {
        this._han       , mrtrue + gradient.y1_ arcSc     this._h   doctype to HTMght) {
    thnly adposi= 10case null:
      , software
/       ��移lue) {
       * @ize);f (arguments.len @param {Object}        
       @param {Object/ You may       for ram {Fu    mediumaquamarine:  Eventful',
    inditwg.orgt = 10   indre reversed.
      lineStr事件处理函数
aram {, h ��以'end':module�ntSt项BC8F��aram {p, q��     dx =m {Object} [context]
     */
    Eventful.prototype.bind = funfunction (event, handler, context) {
 | !event    mediu= this._handlers;

        ifnly adbutedreturn this;
        }

        if ct(ua)vent]) {
            _��四nt] = [];ct(ua)   }

        _h[event].push({
            h : handler,
            one :1, 1false,
            ctx: context || this
 buted    mvent, handhis._handlers;/ 原生c= 1;
 '#FLocalue: '#87CEFA +
    oid && ua.match(/Kindle F  els.wid     l/
   oid doesn't s[conte    appendStroke(th"posadOnl2]), 0, 1);
    if (s s._handle{};
            ret}

    // Di
     * @paraa copy of 
    bisque: asGradient    /**
  :length; i < l;ODO: GradieupdateN   for (var : doctype to HTML5
//   (htts._handlers = {};
        aX + aWidth, aY)his
        }    ewOffset = mr(d.x /             }
              v _h[event] = newList;
            }

            if (_1h[event] = newList;
            }

        butedX + - ��这吧，影�;
            }
        }
       1else { powderblueODO: Gradie }
             
         i';
   f (handler) {
 , '"'�新 '#FFDEAD',
 属性= image.rring] = {colf (handler) {
 ,     ��       vrend!event, buted以及父节�ToRg    orang this.出自身ype]) {
    矩阵 in os, device and br               newList.push(_h[event][i]);
che.org/licenses/LI                      if (ipad) os.R0,
    daHasue: '#87CEFA
    me  da    if (!    
 : '#FFDEAD',
 to: '#FF6347',
     '#FFDEAD',
         ndlers = {};
      || 1);
            }
eplace(/&/g, '&amp;').repla   /**
    '#FFDEAD',
    oldlace: '#FDF5E6espaces and styleshe

define('zrender/cn = _h.le    orangfor s;

    lightslategray: '#778s;

   identity(  pa{
      parts[3] = 1;
ndlers = {};
             /**
             rs;

    }
      style="', ctx.lineJoinlue) {
               X + aWidth, aY)       e素或空
         
            }

   
       [event] = newList; * @type {string}
      ntext)X + aWi      2]ase               cb.call(cargs[2], sou       3              break;
       鼠标veOtext) {
              brargs[2]);ight,
      size: style.fontSize || 
            }

                result.push(cb.call(cone more tha * @type {string}
          this._hand(m, m,       iply(createMatrixIdentity(), this.m_);
  };

s;

        (_h[i][  * �             break;
                }
                
         args[2]);
   args[2]);) {
                    co                      ) {
                    co       if (_h[i]['one']) {
                    _h.splice(i, 1);
g = String(styleString);
          })inst
   of pe = ',
    hotpink: '#FF69B4',
               _h�MOUSEOUT触发比较频繁，一�args[2]);
   WithContext = 1              break;
              return thiWithContext =                break;
         // have more than 2 given arguments
                        _h[i]['h'].apply(_h[(_h[i]['ctx'], args);
                        break;
  ;
                }
                
         �context的事件分发, 最后一个参数是事�，事件对象是：目标图s;

   {
        lenWithContext = futurn _ctx;
        }

        /         var _h = this._handlers[type];
                  }
            }
        }

            return this;
    };

    /**
     * 带有con;
            var len = _h.length;
            for (var i = 0; i < len;) {
 * @param {Function} cb
         * @peX, ',',
                  'ng} type 事件�MOUSEOUT触发比较频繁，一�           // Optimize advise fro�后一个参数是事件回调的context
     * @param {string} args[1]);
                        br         if (_h[e[i]['ctx'], args);
                delete _h[event];
  * @type {string}
             if (_h[i][ * @param {Fun    computedStyle.size = fontSize / .75;
    } atio��
   ndlers[tr) {
              // fi);
            }
ion hueToRgb(m1, m2, h) reak;
                    case 2:
                    mul(_h[       var _    orang,   palegreen: '#98FB9              case 3:
                               opyeturn this;
    };

    /rquoise: '#00CED1',
    darkviolet: '#9400D3',
und'��存这开�/
   s;
            v);
               = m  violet: '#EE82EE',yblue: '#87CEFA* @type {Function}             _h[i]['h'].call(_h[i]['ctx'#6B8E2* @type {Function/ 对象可以ybrown: '#F }
             ��mpiledype]) {
          �   v  =  1 / 3);
    , h, 'px"'; i < l2D} ctlute;width:1/ You may asFo        newList.pushct);
                 break;
               case 2:
             case 1:
          The text drawing fut       ototymFEFD5m @typm     m   */m     m[5backbone
       ng content-* @type {Function}
     *设置se 'alpargu��nc.
//
// Licensed utext]
     */
  |Float32pe = eStyle;
rey: '#D3D3D3',
    lightpink: '#FFB6C1'lookf (fneydew: '#F             '" />')grouineCap(lineCap) {
   y: '#778899',
    lights    }
ion hueToRgb(m1, m2, h) nly ad    orangetegray: '#2F4F4F',
    darksn/Eventful#on         _h[i]['h'].call(_h[
    var cp1 = {
      x: ventful#onmousewheel
     * @type {FineCap(sub(v,
    }
 if (_h[i]['one']) {
             extPrototype.beziv��继Y) {
    var p =v    peachpuff: '#FFDAB9',
  espaces and stylesheet at nction}
     * @defaultht);
    ll
 th:', W, 'px;hei                   _h[i]['h'].call(_h[i]['ct// Y Axihis.textMeg
        returnSrs;

ntext) ?    * @event moduull
 nul fun*n--;
  };

    /**
     * �   *over
1    * @type {Function}
     * // X    */
    /**
     * * @dault null
     *          }
        ault    r
     * @typ          }
        ts[2ram {Futype {Function}
   nctio         if (_h[@type {Function}
   {
                  d (var j = 0; j < 16; j++decomr
//ay.prototype.B22',
    gainsboro: '#e: '* @type {Function}
     * ��解`    orang`s;
   到`       v`, `{
        

     `#onmousemove
     * @g@gmail.com)
 */
dnewList.push(_h[event][i]);
art
     * @type {Function}
     * @def switch (argLen) {
   /Eventful#ondragend
     * @type {Function}
          {Obventf*eturn +     *{num};

    /**
    R0,
       var          if (string}
                     _h[i]['h'].call(_h[i]p://ww     });
WithContext =.ie = true, browse              bre    || !(key in target)) {* @reapMap = {
string(start + 1,ool/event
        slorDdrago{num2er} �3 && e.og(arguments[k])     || typeof e.offs
   != 'undefined' && e.offlorD
          n android
        // - decide     if (_h[finedlRatio: Math.max          dfinedRatio || 1, 1)
        el= sLIDATION_ERR = 
        = sp.TYPE_MISMATCH         =标（�efaul{string}
      ontext = fun;
        var-    */ sy/**
0     tring(start + 1,            ortss.length;
source[key],
   };

    /**
     * 事件/
   handlet);
  到   h++;p, q��   tl',
     varey: '#D3D3D3',
    lightpink:parts[1]), 0, 1);
    l = clamp(percent(parts[2]), 0, 1);
"position:xt]
     */
    Eventful.[];
        e: '#87CCoordTors = newList.push      '[object Error]': re';
[EUP            || typeo           var len    if (!EEE8AA',
            fontSize = pneCap(6',
    palegol;

 ;

 } e 事件.
      turn {
            browser: browservon);
  };

  }

    // Dixt2D = 
     * @paragetCooords(ctx颜色 size as non VML text.
    //computedSol    ction buildStyle(style) {finearam {string} event �      ' + style.variant + '
        if (angle < 1e-6eof e.wheelD        var p0 = gThis claCfine palette    am = m11,
   ain docthe              s     /**
chMD bContex// series.��默认When all  * 停�are /
  _vmlwerOf module:selected from��泡Proto again
        D      s tot.
// // 默认色�dPath;gs, 1)e.detamon: '#FA807'#ff9277', ' #dddd00EventLffc8ddEventLbbe3ffEventLi5ffbb'berry = tr'#bbbb       ? db0ner === b0tener === e2          uncte3ion (e) {
   ff77ddEventLff99ner === 83tener === 77         ?778f    n (e) {
   unct         e77ab        66ner === aa88ubble = trcfunctn (e) {
   ad function (e)          e0083        77ner === 00aaner n (e) {
   0088aa e.canc400d
if  e.re {
 le = true;ubble = tr2e00 else e zrendixed(var stop =var stopeof e.detahighl
    d' &&= 'rgba(255,// �0,0.5)       ixed(op : stop,
      op : stop,
   = 'undefin      格El.style/*jshint maxlen: 330绑定事件     RegEx).se/^\s*((#[a-f\d]{6})| ArrayCtor3})|    ?\( var[\d\.]+%?\s*,\s*ndefined'
            ? A(?:
            ? A)?)\s*\)|hsay === 'undefine(?:deg|\xb0|%)'
            ? Array
            : Float32Array;
)?)d'
   /**
l        * @typedef {Float32Array|Array.<number>} Vector2
         */
        /**
            $/ipeof e.detainame,
   l
  // 原生caliceblucanv'#f0f8lse;
        r;
 quewhit
      aebd7  * @param {qua     0    * @param {quamarin
     7fffd4  * @param {zur
           }
         beig
      5f5dc        creaisq�
      fe4cector2}
    blacknumber
        retublanchedalmond      vabcd             �
     00         crealu�松form    8a2be2            rown retua52a2a            urlywoox || 0deb88      * @parcadet out[1] =5f9ea        retu和�reus @return {
        retuchocohandl 复�2691earam {Vectororal      v7f5param {Vectorornflower out[1] =6495e                siltor(2)fff8(x, y) {
    crimso,

   dc143[0] = v[0];
 ya,

   r} [y=0]
     dark out[1] = y008tion (e) {
 n ou;
        08b  },

           goldenr  * 复b8860    * 克隆一�m11,
    9      * @param {Vectoe2} v
             * @return {Ve*
      64
        retun oukhaki      db76 },

           thisnt{numbe8b    },

           olive         c556b2       return ouorOf('       8c: function (v) {
orchix || 09932cx, y) {
    n ourex || 0
   : function (v) {
s0] = } v
 e9967    /**
    �量�ea         c8fbc8       return ou if ( out[1] =483d  },

            if (tor2} v
 2f4f4            * @param  {Vector2             * @returturquoll(c1] = yced1         * @par       retu9  geopPropagatiodeeppin        149     out[0] = a;sky out[1] = yb   }
         dimtor2} v
 69

  urn out;
       Vector2

            /**
odg copy: func1e9r} [y=0]
     firebr         2  *  {Vector2} olctor} [x=0]
   ffaf        retufo.ver         c228b @param {Vecto
// i{numbefy || 0;
      * @sboro           ion (out, v1host} [x=0]
   8      * @param ���       d  };
           ou�量
     daa521] + v2[1];
 or2} v
 80},

rn out;
     Vector2},

            /**
      clo8    * 设置吩放�yellow} v
  dff        out[1es nydeVector/
              /hot
          69bector2}
    rce.an*
      cd5c5      out[0]rce.g
     4    @param {Vectivor2} v
     or2} v1
               f0e68      out[0]lavgreen:��项6e6f    /**
          oubluseFloAndAd0f5] + v2[0] * awn�放后相7cf        returnlemonchiff��个�                  stop out[1] =add8e6,

            /ector2}
   ,

            /�减
 
       e
            cre stop��向量
ram {Vectorfafad@param {Vect{Vectoor2} v
 d3    ram {Vector2} v2
 Vector2     */
            sub:       c90ee9@param {Vector2} 
          b6cnction (out, stop的两个�ffa0           * ] = v1m {Vector2} 20b2               retu           87ce[0] + v2[0] *  = v1m {number} b
78         /**�度
       Vector2 @param {Vector2} v
teel out[1] =b0c4d* @return {V�度
            fffe@param {Vectorm    setor2} v1
     retu          32cd3aram {Vector2}n      c   *   * 向量�rrayCtor(2);nction (out, vmaro��个顠
  [1] + v2[1];
medium        * @retu66cd    },

     v
    t;
                       v
    ;
         ba55 */
         v
    purpl    se9370d8           returnurn out;
    3cb37nction (out,       ram {number} 7b68e* @return {V       p use�放后相�fa9number}
                      se48d1,

          v
                  *7158[1] = v1[1] midn   /**
      19197m {Vector2} vint ligmfunctionf[0] + v2[0] *mistyltaL      vare    /**
     occasi- v2[1];e4b[1] = v1[1] navajo1
          dea            nav2} v
                 /oldlac[0];
  df5   * 向量�0] =          [1] + v2[1];
0] = drab @retub8e2*/
         v[1];
       a5{Vector2} out
[1];
*
      ff4    * @param {Ve         da70d  * 向量�var ��向量
     eee     ion (out, v1,           8fb9[1] * v[1];
var s           seafee             var ector2} v2
   d870    out[1] = papayawhip1[1] * vfd[1] = v1[1] pDFF2puffurn out;ab         /**peru     * 853se;
        
          c0ction (e) {
 plu      ddagetX r2} v2
   ow           */
e*
             v[0] * v[0m {V  /**
       2} v2
   [1] + v2[1];
rosy   },

   t
               roya         *4169           ousaddle   },

   8b451*/
         1[1] - v2[1]a807@param {Vectsand * v2[0] + f4a46           /urn out;
     e8b5      * @parseashelr2}
    f5             sienn{numbea0522return {numbsilif (    *0    ion (out, v, /**
          etion (e) {
    * 向量乘6a5  },

                     * 080ut[0] = v1[0]
             *;
            },
nn (v) {
  a[0] + v2[0] *am {Vector2} out
  f7se;
                     *4682 {Vector2} v2t       d2b4 {
          teor2}
   (v1  /**
       Witht] * v[0d8bfv[1] * v[1];
tomat
     ff634      * @par{Vector2} v1
  0e0d       out[0       retuee82             whea  retuf5deb*/
         1
           1] = 0;
        sm    unction t[1] = v1[1] ction (v) {
        out[0ram {V0] / v2[0];a             */
  or = '#fff';right 20调    */
    ent.y1_ = aY1;
    stomPar sto(user},

 解绑事件
var stop =        /*            ctx: context复位
         */
    ent.y1_ = aY1;
  reset},

    *
             * 计�ta : getax(max.y, c2.y, c3.y, c4.��取    */      

    // Canvas context properties
    fined'meStyle.width = oldRunidx     */t);
    var pEn
    if (argumder thengt        /*]     }
    } v1
       "position:der the ce: function  this.globalAlp= 0; lor(idx,��向量间   * @return    =量�           br        /*�算向量间for (vumber}
    /
        f        /*[    %Vector2} v2bos = te zrend      ctx: context    }
   
     高亮          );
            },
      Hp : stop                      * @returnop : stop,
      eturn (v1[0] - v2[number}
             */
�',
    distanceSquare: function (v1, v2) {
 {Vect         r   * @return      Dispatcher : Eventful
                   */
               distanceSquare: function (v1, v2) {
 g    * 求�      .m_ = createMatrixIVector2} out
             * @param {Ve    ��渐变nction (v1, v2) {
                return Math.sqrt(
               x0 ;
          th.sqrt(
               = 'auto';

    // get the r 'auto';

    // get the or* 插�终�个点
             * @parariginal size
    var w = rriginal size
         * rn Mape)
       列�mespace[1] - v2[1]CrwritGrade = * 1;
    this.globalAlpt =    sl        call(sourc = w;
     r1        ler      * 向�rt
     ];
      dx = arg;
    ion = iphone[2].replace(/_/ool/event
p://g            fo    _h[            // var ay = v1[1];
      动，如�        if (webos) o        obos = true, os.version = webos[2];
[1]);
  -;

     Stop(        o) {
            o递归= v1[1] + t * (v2[1] {Vector2}__nonRecursned' &&ill allow canxt2D = [1]);
  th();
    this.fill();

 ��性;
                     textAli  * 插值两个点
           doc.name= 'auto';

    //                      * @param {Vector2}    out[0t
             */
            lerp: function (out, v1r ax = v1[0];
    , upar      // var ay =w;
             out[0] = v1[0] + t * (v2[0] - v1[0]);
                out[1] = v1[1] + t * (v2[1] - v1[1]);
                    /**
             * 求两  
            /**
             * 矩阵左乘向量
             * @param {Vector2} out
             * @param {Vector2} v
             * @param {Vector2} m
             */
            applyTransform: function (out, v, m) {
           两种      之间;
     }
);

odule:zrend v[0];
        }       起始ce: function (v      * @paramend      ev1
             * @par, 0, 1);step        ��the Licen 'undefined' && }   }
);

2} out
     r ax = v1[0];
    Step      unctiom22, sOwne - m1) * (2 /      .sizRGBAunctio动，如�ctor;
       enion (nee1], v2[1]);
getData          return out;
     vect    }
contextPrototy      * [aram {*} targetMathR = tend  elseProto��继/     .lenSquare;
      G vector.   re= vect basistance;
        vector.  //ctor.2 = vector.2istanceSquare;
        
    thactor.3 = vector.3istanceSquare;
        ��成      集合0;
    gradifix by       ap: funct���o its squa        if (webo (par vector, ocumector.dintex
               ',[],funrue, otancet = styleString.indere = v/
  .siz      n: '#FA8072',
ram {djustradienfloor(r),  medi255 ]     [dx,  dy,  1]
matrix = {
       g    /**
       tion} clazz 源类matrix = {
       b    /**
             * 创建一�.to  spr(4 in "100 100" c    ,     od[3] ? ipod[3].r.pro     ine(
    'zrengor(6);
 Gine(
    'zrenbor(6);
 Bine(
    'zrenaor(6);
              var p = g   *or.diine(
    'ocumquare ine(
    '
   returnine(
    '    ol/matine(
    'r/tool/matrix
       r, g) {
 a],               angt':
                     * @param {Vector2}ion} [h(out,ype ram  {Vector2} out
       1, v2) {
                return Math.sqrt(
       v2[0])
         re = ve       out
             *, 0, 1);[Math=20]unction (out, v1, v2) {
           )
            out[0] = Math.max(v1[0], v2[0]);
                       = Math.max(v1[1], 0,
   ]);
or.lenSquare;
  le});
       targetProp == 'o],funcepUSEDOTYLE.styler the License.

2Arra 2urce[key],
       appendFiout
=t
    vmlStr.push('2Array
             r/tool/ {Vector2      Math.         ' path="');

   ction(ouer/tool/util
              if (webo});
n(oubject.pron
            /**
             tepl
  [0] = m[0];
         i      out[f(obj. = m[1];
                   /**<      unction}
     * @default5] = .pop        * @param {*}new CanvasRenderingArrayr daroncatt32Ar'G_vmlCanvasManatotype.stroke = function(aFrdoc) {
 v2[1]) * (v1[1] - v funct�   t组转为 = [];
definrray.<,例如:<br/>th.sqrt(dacp1, [60,2, m2)0.1]t[3]ma]);
 out
 ��量最� oldR：     1, m2) {
   [event] (v1[0] - v2[0]}n (outrray.<number>} th.sqrt(
       der the            */,
     rgb * (v1[1] - v2[1])
                );
            },
x
       (ou,          * @return                 @tyrgb           size=(outresulatae: '#000t, m3] = ] + m1[4];
     4odule:zrender/too (out, map] + m1uamarine: '#66CDAAreen: '#cdule:zrender/tool/util
        tes.1 ?Versioneiln ou:    this.beginPa|Array.<number>} o                   b      .indexOf('hex')G.
 * 矩阵相乘
      xt2D = '#.
//('to<< 24
    ] + turn<< 16              < 8
    +     2])).toSer th(16).s�向(pt图表库，�t: '#9400D3',
    deeppnumber>} out
    s       * @param {Float32Arr    * @ret5] + m1   */
  , 3     [dx,  dy,  1]
       return out;
            },
                /+ '%             * rray|Array.<number>} out
 ']) {
             loat32Arnt} ule zrender/tool/even<number      };

    /**
    _:path textpathok="number>} out
   a       * @param {Float32Arr m1[2] *m1[4];
      unction}
     * @default] + mpush            trans|Array.<number>} out
      efaulmatrix {number   /**
1 backbone
           xt2D = C      + '(.
//] = a[1];
 0, 4).join(','
   '��容
  ��行拷贝的对象
         *t, a, rad) {
               3var aa = a[0];
            ll};
    var max = {x: nrray.<n��符串    vari�    
                out[1] = 0;
                out[2] = 0;
        der the                 );
'undefined' && e.clientY;1[1] * m2[0] + m1[3] *  out[3] = m1[1] *pe =          * @return= Math    ima * st ight) {
    th     >} out
   out
                 }
                     out[2] = ac *        thi     (out, maram {*} targetype {string}
  + ad *rep   *(/[\d.]+/g,ggreen: '#0 }
                                * @param {F});
n��方
        owing check doesn't account for skews (whichAlph aRadiu        /**
   +odule:zrender/tool/event
         ihis.cu
          lightcyan: '        ata* @param {Float32Array|Array.<    */转化th.sqrt
                var ct = Math.cos(rm2[0] + m1[3] * m2[1];
                out[2] = m1[0] * m2[2] + m1[2] * m2[3];
                out[3] = m1[1]co#6B8E2     1[3] * m2[3];
      tStyleCCalculnifo       * st ult[key] = clone(source      v1[1] + t * (v2[1] - v1tx + st    vect   out[2] = ac *to.fo|Arrlowenumberight) {
    thle.font out[5]  return {
      x: Z * (aX *  out[5]     ' coord        thi ct + ad * st;
    hsb       * @param {Float3tx + st_HSV_2_RGB     ];
                out[2] = m[
             * @laram {Float32Array|Array.<number>L out
             * @parcopy: functio v) {
            param {F] =  v) {
            varam {Float32Array|Array.<numbeRGB_2_HS             * @param {Float32Array| v) {
            
             */
            invatx = a[Lction(out, a) {
           {number} ra|Arrfound using
    // * m2[2] + m1[3] * m2            * @param {Vec      var atydefin的ce: function (v1, v2) {
                return Math.sqrt(
        var ct = Math.cos(rad);

           der the     rray.<op.c    r,g,b,a;
       out[3] = m1[1] * ad;
      m_ = createMatrixI      out[1] =  out
                  return null;
       p.off�        }
                det = 1.0 / det;

                out[0] = ad * det;
                out[1] = -ab * det;
               out[(0���)
define(
  
                out[3 = aa * det;
                out[4] = (ac * ty - ad * atx) * det;
             16  }
��
                det = 1.0 / det;

                out[0] = ad * det;
                out[1] = -ab * det;
    rrorrik@gmail.，#rrggbb�块
 * @module zrender/HandleHex = aa * det;
                out[4] = (ac                     return null;
    HSV
                det = 1.0 / det;

                out[0] = ad * det;
                out[1] = -ab * det;
    HSVA�开始�hsva(h,s,vc * det;
                ounfig/Handler',['require','./config','./tool/ensvaty - ad * atx) * det;
             ol/vector','./tool/matrix','./mixin/Eventful'],function (require) {

        

        var config = require('./confi');
        ar env require('./tool/env');
       var eventTool = require('./tool/event');
,'./tool/event','./tool/util','./toolBg');
  ','./tool/matrix','./mixin/Eventful'],function (require) {

        

        var config = require('./confick', 'd     bvar enac * det;
                outart   var eventTool = require('./tool/event'); aty - ad * atx) * det;
             HSBk', 'dblclick',
            'mousewheel', 'mousemove', 'mouseout', 'mouseup', 'mousedown',
            'touchstar', 'touchend, 'toumove'
        ];

        va isZRenderElement = function (event) {
     ,'./tool/event','./tool/util','./toolLck', 'dblclick',
            'mousewheel', 'mousemove', 'mouseout', 'mouseup', 'mousedown',
            'touchstaarget
       lvar enlchmove'
        ];

        vLr isZRenderElement = function (event) {
    l       // 暂时忽略 IE8-
          Lget
                          || event.srcElement
                          || event.target;

            return arget && taret.claName.match(config.elementClasName)
        };

        var domHandlers =,'./tool/event','./tool/util','.rray.<n��th.sqrt(  out[0] = ad * det;
                out[1] = -ab * det;
           this._isM out[3] = m1[1] *e Li = aa * det;
     rguments[wserin              );
               ender/            true, n ouender/Handle* @param {Float32Array|Arrakep.TYPE_MISMATCHtotype.stroke = function(aFi).replace    this.fill();

 ��除       ��eigh��空�var W = 1  out[0] = ad * det;
                out[1] = -ab * det;
    无                    out[3] = m1[1]        outm_ = createMatrixI        * st * aty - st\sx;
  ','./tool/event','./tool/ut       ��范  */
         det = 1.0 / det;

                out[0] = ad * det;
                out[1] = -ab * det;
             后  }
             this.globalAlpder/mixin/ * st + ab * ct;
    }
);
 this._isine-bloc/**
            继承关系
            �触发click事件 color stops in ascen/ 去掉            t;
                out[2] = ac *) {
sv与hsb等价ab * ct;
        = ct * aty - sthsv/i              uments[rgbm2
   时候copy: functio/^#[\da-foat3$/i.tesout[1] ��数
                   parseInout[1]    */
   ,parastring}
          htsea= Math& 0xf0';fo< 8string}
          ocum           * param4 /**
             *    }
       *                       y.<number>} a
      r     
   rnumbg{
       gnumbb{
       b} v
             */
            t21=', this.m_ntimeHk! 
  以    ��stop��{strin不过 chroLice��性x = ��对差        _h[ey=',        }
            ^#unde    )DBLCLICK事件
   $ }

 #$1$1$2$2$3$3             */
        �config.EVENT.CLICK事件
    加深或减�
    ��ue: '>0_lastHkable)
    <0r.clic   var _lastHover = this._lastHover;
                if ((_lastHover && _lastHover.click] = 0;
        ue: ' 升降程度,取值�  va    1ction ([1] - v2[1])
      _lastHover.clic后rray.<numver
                ) lifout[1] = ue: '#7B68EE',
           out[2] = a[2] * vx;
                out[3] = a[3] * vy;
                oi             >        target[key] =                 n out;
            },
            * �ource[key],
  
             *          ue: '#7**
      t{Event} event
    out[5] = ct ;
      * vx;
               out[4] = a[4] * vx;
           r scaleX = scaleY = 1
    
    // For some rea     },
, m) {
             Array|Arra},
 his._zre* 'top:ue: '#7           break;tStyle.fontSize),
        fontSize = his._zrend( // .filis._zr   r      
                          // http://w  var p = getCoor    ) {
      r aa = a[0];
        g.EVENT.CLICK事件
    翻转,[255-r做�-g Webkb,1-ad < 5) {
   det = 1.0 / det;

                out[0] = ad * det;
                out[1] = -ab * det;
    wheelD  },

            /**
        vers               // �         out[2] = a[2] * vx;
                out[3] = a[3] * vy;
                out[4] = a[4] *out[3] = aa *  mousewhee3] * m2[5] + m1[5];
            return out;
            },
vmlStr.pwheel   this.beginPa         *         * @param  * m2[2] + m1[nfeng@gmail.com)
 *         er简单
           混typeof Fl             || -event.detail; // Firefox
                var scal1rede@fi           out[0] = ad * det;
        2rede@��                newZoom =, 0, 1);w   can      权重[0-ld < 5) {
                     �     nt_r = -a)或ut[2] = -ac * det;
                mir/Handl�个向�2,.maxZoo            var mouseX = this._mouseX;
    els     out[2] = a[2] * vx;.0 /              out[3] = a[3            *en > 3) {
                  maxZoomn out;
            },
             pos[             ' path="');le - 1);
Left atrix maxZoo  */
                         maxZoom
  c0CD't[4] = ct * atx +n liis.painter.eachBuildmr(d.x /             e';
is.painter.eachBuild2inLa {
    // TODO: B= scamatrix1] *=5] *  1);
         {
   his.c((wion s[0]   * ? Vect(w  //     _ + rue;
)
    min   contextPrototdsRefre';
    dsRefre      layer.dirtx + st * ament(event)) {
                    return;
        his._zrenderEv1entFixdsRefres
     2f (needsRefron);
  };

  // Gradie     out[5] = a[e;
  eedsRefrsh) {
        'top: / laye单位矩�out[5] 0],
     0, 0],
  in    MOUSE        layer m1[2] *e;
       e bog                eturn 考虑透明anvas{display:in                   layer.__zoom =h / 2;

    var= aa * ad - ab * {
                        layer.aty - ad * atx) * det;
    随机             n * (v1[1] - v2[1])
            值�的时候触发一次
define(
    'zrrandom{
                ouy.<numbapMapt) {
    v
          0];
aram     */
 2, 8'./tool/event','./tool/utitor2}  v) {
        ,imeStyl��    ��    ul : functionRGB Loadin[0-255]) {
          HSL/HSV/HS        ret1]ul : functionA                   e        mptimi      ：th.sqrt(# * m2[2] + �时候th.sqrt(m
                     %,g%,b%is._lastY = 2] = -ac * det;
            T.CLICK, event);
        ouseX =%,s_mouseY;
    end', 'touchmove'
   nction (event) {
nt);
    thls._mouseY = rget.className.mat
                var ct = Math.cos(rad);

                out[0] = aa * ct + ab * st或) {
    rex(v1[0], v2[0]);
  [4] * vx;
 + ab * ct;
        {

             yer.scale[0] *     }
   m9',
 ion () {
  t[2] = ac * ct  * W,     apache.org/licenserower/toError('T泡�  //        e
   ');
    }
);

defin',
 �o its squa              o               yer.scale[0] *= scray|Array.<number>}rgbdispatchAgency(r
    se null:
      causeX;
       al
      fi    * aty - s'#X : version = out = new ArrayCtgn (e[ r.dis+ are , turn �找    d��辡找5]maquamarine: '#63] * m2[5] rgb[5];
                return out;
            },
           ouseY -     * 双��
     /**
      ��变换
             * @param {Float32Array        out[2] = m[r[4         this._itera���              * @innergbg_vmls._larsion = ,od[3] ? ipod[3].    gTar             || t��处�gTara[4];
                    if (!this._ = layer.position;asfound) {
                    // 过滤首次拖拽�inPa= {
       68EE',
    mediumspringgre>} out
   %         t和dragLeav     2.55平�te(m[1][0]) && isFinite(m[1][1]) &&
    ��产生的mouseouc                   if (!this._draggingTarget
                            e] > dre reversed.
      lineStr.pus32Array|Armouseout和d   /*(a                 if (!el.getContext) {           || (this.5     r[6         this._iterahsb = evseX seX -           * 鼠�sxrget)
 cursor = 'd                ) {
       sto        * 參素          36{string}
          l
  f (th手指）x坐标.
  距�f (th    // 

           f (thog(arguments[k])3] * m2[5] [ rget  * @author Kener (@           // 过滤首次拖拽产生的mouseout和d      cstan100  */
            rotate : fun    * @param {FlolearHover();
    unshLICKhnings of opacity and o:opa           this.painter.clearHover();
                }

                // set cursor for root element
         @param {Float32Array|Array.<number>wn
   ayCtor            thi              ) {

                    // 判断没有发生拖拽才触发dblclick事件
       a     this.,ickThre0old < 5) {
                           ncy(_lastHover, EVENT.DBLMOUSEut[1] = t.y,
                 out[2] = a[2] * vx;
                out[3] = a[3] * vy;
            
    || this._mouseY - this._l**
             *
                this.painter.eachBuildinLayer(functionber} rad
    N 0, 1(aventunction(]) * (scale - 1);
    ��（手指）移动响应函数
         / ��现co���m1[3]           ap(           // Keep the moule.fontfu(ctx, digo: '#4B0082',
    ivoryastY > 1) obal{
    = v1[1] + t * (v2[1] - v1 out
        Canmouseout',目标对象
       document.body.le] = m[4];
            _drag_zrendfutoty      ];
                ounsform = rap.TYPE_        })调整_clickThr
              atrix reEleessFg{Function} hand//    o
   & >    >call(argumes.
/difyy === 'zhiundef2014-05-25 beca    -0 i;
"100 100" ] + ver.csult.kable��继承关系
    ursor;
          ;
                out[2] = m[ursor;           baseClazz 基类
onfig.EVENT.MOU     * 设�
                ver.c canvasElemeElement The elem  out[2] = a[2] * vx;
 det;
               fun�型
     */
   ] = le.font   // �ER : 'mused              })参见{
       compeasyrgtyle;
} out.php?X=MATHElement The eler>} out
        @param {Float3HenderEveSEMOVE事件p://almoloat32Ayer.scale[0] *V      * ��单位矩�//onfi @meth0    drawImage p://R;aleY * Z;
    entity(out)t
   ight) {
    thS                   var  veVessD5_[1][0] / scaledist      return;
         //      return;
   
              '[object Error]':     H * 6.ie = true, browse
     6   * @return {number/_/g, '.') : null;
ool/event
        ediuh//developer.mozillerOf n li    'top:S            * @innere';
 while (elwhil000Ciet cursor for rot.nodlemee != 9) {
                            * @inner
  {string}
          16);
    }
  }

  f              * 合并�   /**                  var _div���        }
        ocumv  contextPrototype.n (ev// The following check doesn't acc        th * @param {Float32Arra    

  // Helper functocumt);
                                    }

                        etern = CanvasPattern_ntNodutil
         * @pa    }
                }

     contextProtott: '#9400D3',
    deepp    th          * @param {FzrenderY = this._lastY;
    de;
                n (et);
           efault';
                this4_isMouseDown = 0;

        contextPrototype.cessOutil
         * @pa             this._processDrop(event);sMouseDown = 0;

     t);
                      if (!this.painter.isLde;
            ce(i, 1);
            res e :      mouse255 {
                 v  return;
           g    }

                et sa = this._zrenderEventFixt2D = [ R, G, B      ge       鼠标（手t : function(��应函数
             * @inner
             * @param {Event} eLent
             */
     L      mouseout: function (eent) {
                if (! isZRenderElement(event)) {
              L**
             * 鼠标   this._clickThresho  //   this._clickThrderEventFixed(event);

          de;
            ] + L     /**
             * �re';
   t// Prlement && elementStyle.fontSize),
        fontSize = p
    Lis._m的d
   L     ' color2="', color2, '"',         r.joLnch n = m.max(wi            * _HUE out
  ists;

 Hnumb'roun��的mouseOut
  dist   this._lastMouseDownMome事件
          //   this._lastMouseDownMomen- = new Date();
      * @inner
             * @param {Event} event
     _lastMouseDownMomvH // Keep the mouvH               }
   vH.proer.position[1] += dy; = thiser/tool/util
      vH p.V    this._dispatchAgency((    ouse<m) {
                     vesh)(v   lv/ Use    thiOWN, event);
            r.jothis._lastDownButton = event.butin obj) {
  );
            ���this._tern = CanvasPattevent.button;
               ew D    H     r = 'move';
                        Event} event
    atx = a[4];
    {
               ;
            },

    ion (mous       */    拽
           distSloat32Ar         event = thi           },        1] += dy;
   vMt) {
              * sDragSMin.r, EVENof    .style.cursor =asetX
                      axis._isMouseDown = 0;
      del          -r = 'DragSD分�    ver.cram {Event} event                  H @inner
              lineStr    , event);
        drawImage      分发W, ',', Z * H, '"',
    {string}
      almo@inner
             *n() {

  // alias s     分�/_dispat(source) {
       分�   }
((onfig.ERstanram {Fl       .0 / 3     string}
               distS       * Ginner
             * @param {Event} event
                      * - thir
             * @param {Evie = true, browseRevent       * @return {number       if (-                      }

                   G           }

                // = new D处異
   ol.stop     
         t: '#9400D3',
    deeppB��重要
                event = t       enderEvGntFixed(               _:path textpathok="is._lastHover;
           /       this._d,'../dep/excanvas'],fuhis._lastHover, EVENT     /USEDOWN, event* @param {Event} event
       vaingTarget) {
almo
   1height /= arvent        * @inner

        H, S, V@param {Event} event
    aty = a[5];

   {
                    return;
                }

                event = this._zrenderEventFixed(event);
                this.root.style.cursor = 'default';
                this._isMouseDown = 0;
                this._mouseDownTarget = null;

                // 分发config.EVENT.MOUSEUP事件
         if (! isZRende      +r = 'er default scroll as._lastHover, EVENevent)) {
     );
                this._processDrop(event);
                this._processDragEnd(event);
            },

            /**
ton = event.button;
                       器默认事�he
   * passed in {@code obj} as {@code this}.
   *n (event) {
      nfig.EVENT�使用
                    return数
             * @inner
             * @param {Event} event
             */
            touchstart: function (event) {
                if (! isZRenderElement(event)) {
                    return;
                }

                // eventTool.stop(event);// 阻止浏览器默认事件，重要
                event = this._zrenderEventFixed(event, true);
                this._lastTouchMoment = new Date();

                // 平板补充一次findHover
                this._mobileFindFixed(event);
                tthis._mousedownHandler(event);
            },

            /**
              * Touch移动响应函数
             * @inner
ende   t    * * @param {Event} event
L@param {Event}        // 原生c      },

   平�     },

    v2) {
     ector2} v2 :this._lastCli + v2[1];
        Float(     
            tion (out, v) Float(tion (out, v) ] = v[0];
                  }
                      this._    /**
    �function
    
                        //Float(            //
                /**
      Float(    /**
      
             复制矩阵
Float( 复制矩阵

                      Float(           v2) {
     alse;     alse;ut[0] = v1[0x :     },

       f * @(e)            ri     ret v2[1];
   ) {
     ) {
    var d = v    : };
            };
  A      }
A   var d = vHe retr, coArg(handler, SLntext)SL
            retion b arg
            r      HS
        /**ftarturn hand             reVurn hanVrg2);
         t, arg1,V             e Lictext: '#000000',
 x
     ler,    }
        };1] = -aler, , m12,ig.EVENT.MOUSEW:      
             vecFloat( vec p1 = getCoo) {
     en: '基 p1.x L text.
    //comen: '/Ba'#DEp0.x;
         var dy = p1.y - p0.y;
        angle = Math.atan2(dx, d_procerik ( * @innengle = Math.at/) {
     f (_hdef = m[1] * I     (varSty_handleproperty det;
    [         =��，�]��
         */
        f)) {
=      00'] 填充        
         */
        f 'mous      var len = dy, maxlerNames.length;
            w    Ca inibutt']    帽样    tnt]) {
是     rendu] = Mvalides.length;
             1,
      =1        all angle(domHandlers[name], iopacity
       *     this.pa     }

        /**
  shadowBlur=0] 阴�d) c糊度['_'��于0ntextPes.length;
            whconstlen--) {
              lerNames.length;
           * @constO| DEFAor
         �: '#: '#4��区域
         * @param {module:zYor
        var storage Storage实例
        f  = ];
    s�('wr附_lasdth, stnter Painter实例
       len--) {
         er.silerNames.length;
            weplace(/] ar Handler =stance['_eg:'b out18px verdant[0]�件分发器特性
      Eventful='on
i  Eventful.calt);
  ,ring name +i��端� e / , ros[1])top, bottom = root;
            this.stAlign]�
     roto��s.storage =     ��wn
   normventful.call��平对齐= ima* 
                // this._lastHinter = p   out[1] =             /       = root;
            this.st            // this._hasfound = false;              //是否�垂直over图形元素
            // this._lastHover = nul/ 各种事,    d;
  p|Arrbetictp:// sty, ideographicmodule:zrender/Handler} instancntext propertie
         ~Ityle.sizlinender/Handler
         *x 左上角  da��x轴       nder/Handler
         *ystTouchMoment;
 y         nder/Handler
         *ace(/_* @t��盒of Arra  }
        }

        /**
 hone/) 
            thlk = truduleproduce an unexpected
         aram {string} event 事件名
     * @pguid typeof e.wheelD} event �log;
    �
     * 
     * @paritDomHandlt and VM;
         lt bec，事件绑定，支持       ，事件绑�elta != 'undefined' && e.we.cursor ml
     Manag permnt-wor['G_ndow.addEventLis'             neeparam {Object} context
     */
    Event   if (elu  va                  inter拽
           Delta
                   || typect Error]': 1oocum                    ioot.style.cursor
     * @param {            �
     * 
     * @pa    // mobile�t and VMrt', this._touchstart 初始�oot.style.cu鼠标（�pe {lackb
     defau_vml_:eplace(/t.addE     t.addE // this           },

       os.ipad = true, os.version= ipad[2].replace(/_/g, '.');
        if (ipod)unctitener('t) os.we         }

    switck/move // this) os.we // this           * @inner      _60;
   lineStr = [];

    var       root.addEventListener('touchend', this           return sourcepod) os.ios = os.ipod = true, os.version = ipod[3] ? ipod[3].repl        can
                  lt be)ht =wser.firefo));
 browser.webeplace(/&/g, '&amp;').repla

// Knochend', this._touchendHandle           op function(aRot) {
    vlorDComputd.
// * Canvas width/height should is usi});
  };

 ��事mousedownHandler);
               +);
              root.addEventListener('mouseup', this._                 // TODO: Fig
                root.ar default scro
        if (ipod) os.ios = os.        if (webos) os.webos = true, os.version = webos[2];
    = ipa        erry) o: 'dragleave',
          yt);
    root.addEventListene      */
        funcodyellow: '#FAFADoldRof Arraymber，
   ��       ��新�Very字nks �发生拖�[0]) / 360 % 360;
    if (h <der the oid version
        // -layerY
                   || typeof e.clientY != 'ublclick = this._dblvide in os, devmousewheelHandler);
           root.ondblclick = this._dblblclickHandler);
 l color="', color, '"er);
              root.addEventListener('touchend', this._touchendHandleto.fo_;
            root.addEventL[3] ? ipod[3].replace(/_/gfuncthes

        if (browser.webmousewheelHandler);
           ent('onmouse'mousemove', this._mousemoveHandler);
            ipod = true, os.version = ipod[3] ? ipod[3].
                    root                  ' opacity="', nocusposition="', foccan be ugh.m_,
        delta = 100  p.V.rimtabletos = true;

        // Todo: clean this te = fu      {Object} [context] 响应�(ace(/_   *d.
// * Canvas width/height should is using
                    root.addEventListener('moused   case 'top':
 006 Google Inc.
//
break;2006 Google Inc.
 Copyrbottomt 2006 Google Inc.
//
/y -= lineHeight * text.lengthensed under the Ap//
// Licensed under the Apdefault Version 2.0 (the "License");
// you may not use th / 2ensed under th}
2006 Google Ireturn {2006 Google Inc.
x : x,2006 Google Inc.
y : yapplicable law or width :softwaapplicable law or h you m:");
// you may not use th.apache.org/liensed undeicenses/LIC/**2006 Googl* @alias module:zrender/shape/BaseCONDITIONS OFconstructorCONDITIONS OFextend KIND, either expmixin/Transformablmplied.
// Seecific language governing permEventfulCONDITIONS OFparam {Object} options 关于ress 的配置项，可以是 * Radia自有属性，也re not im自定义的 VML v。CONDITIONS /2006 Googvar r im = funct re(ort rep)/
// Unless req2006 Google Iort repe=dsize. Th|| {// WITHOUT ented.
// * CoordOR CONDITIONSIONS OSess  id, 全局唯一2006 Google In* @type {string}yle values whiche canvas 't ithis.idhe width aente|| guid();censes/LICENSEfor (one.key indsize. Te not implementet implem[key]he width as modw.apache.org/licenses/LICENSEriority than the
//基础绘制样式yle values which isn't IND, either express or im~Ir im   wiStylet.
// * Painting mode isn't implemese-do = Behavior frd heighrder-box. Either change your
// 高亮 HTML5
//   (http://www.whatwg.org/specs/web-apps/current-work/#the-doctype)
//   or use Box Sizing Behavhighlyou he-dorom WebFfor speed impro|| nullp://webfx.eae.net/dhtml/boxsizing/父节点yle values which readonly
//   (http://www.whatwg.org/specs/webGroupt.
// * Painting @.
// Yor.lin.
// * Painting mode isn't implemeparent =r.linfeng@gmail.com
pleme__dirtyrom rues').getContext) {

(fuclip   wiThe []p://webfx.eae.nissions and
/.call(plem)ensed under thn Issues = Math;
  var mr = m// WITHOUT OR CONDITIONS O图形是否可见ersi�� {

时不ype tobs;
  ersi��是仍能触发鼠标事件CONDITIONS OFnameKIND, either express or im#invisid
// limitationsisn't booleant.
// * Paiave a canvafalimplied.
// She canvas r im.protoisn'.vigator.u* ClThisp://webfx.e  var abs = m.abs;
  var sqr��略.sqrt;

  // ent}
 bs;
  的ype to以及 Z = 1cision0;
  var Z2 = Z / 2;

  var IE_VERSION = +navgnoruserAgent.match(/MSIE ([\d.]+)?/)[1];

  /**
   * This funtion is assigned to the <canvas> ||
   as element.getContext().
   * @thz层levelt ar��定绘画在哪层canvas中0;
  var Z2 = Z / 2;

  var IE_VERSION = +nazo an serAgent.match(/MSInumber]+)?/)[1];

  /**
   *0 funtion is assigned to the <canvas>as {@c = 0ent.getContext().
   * @thvar sqrt 拖拽0;
  var Z2 = Z / 2;

  var IE_VERSION = +nadraggnd
// limitationsh(/MSIE ([\d.]+)?/)[1];

  /**
   * This funtion is assigned to the <canvas>
   * @pa as element.getContext().
   * @thvar sqrt 点击0;
  var Z2 = Z / 2;

  var IE_VERSION = +naclick @param {Object} obj The object that should act as this when the function
   *     is called
unction iam {*} var_args Rest arguments that will be以hovese for the spe Z / 2;

  var IE_VERSION = +na2);
  @param {Object} obj The object that should act as t {

 funtion is assigned to the <canvas>obj, a.con() {

  plemented.
// * C Binds a function��，跟as {@c一 HTM��响 * Radpe toy
//��后顺序，quot大的ress 会覆盖在
    ��的上�or s+)?/)[1];

 ub pix� thi会创建新的ction ，所以优先级低于as {@c;');��且频繁改动y
//��销比as {@c小很多fferent from ted.
// * Cose the
   * passed in {@code obj} aode this}.
   *
   * Example:
   *
   *   g = bind(f, obj, a, b)
   *   g(c, d) // wi f.call(obj, a, b, c, d)
   *
s is used fovml_', 'urn:schemas-microterns oCtion Rer exingCon not2D} ctxyleSheets['ex_canvasE ([\d.] [isHor speed= elem]at will使用boxsiz VML vyleSheets['ex_canvasFipping } [updateCallback]schemas-micr       需要异步加载资源 (!doc.nents, 通过这个= Maw:hi(e),:schemas-micrdth:300让painter更新视图，bo thbrush没用，/ defanted��重载 // A funtion is assigned to the <canvas> // A* Clipping  (ctx, ngElement.ie no2006 Google Ione.ior from WebFbeforeB// Aar G_vmlCanvasManap://webfx.eae.nctx.beginPath/hei.getContext) {

(buildreater G_vior fc || document;
 switch (ior fet(docTypeefault. IE in
//   Q/* jshint totype:startng mode isn't ime Apache Liceht 2006 Google Inc.
//
/    fille a dummy elemene Apache Lstroket 2006 Google Inc.
//
/   // );
/Wftwar> 0 &&it_, : func, doc));
    },

   //
// Licensed under the Aplement('canvas');end  doc.attachEvent('o.
// You may obtain a copy oft_, this, doc));
    },
t.
// * Painti dummy element so drawTextill allow c, Behavior fc || document;
 plemeafter      varin;
  var mc =t.getContext().
   * @thi��体ype to ��作前{
   �些公共 page yleSheets['ex_canvas_']) {
      var ss = doc.createStyleSheet();
      ss.owningElement.id = 'ex_canvas_';
      ss.cssText = 'canvas{-2.0
//
nly supp处理后的 HTML5
//   (htt addNamespacesAndStylesheetc) {
     ument);

  var G_vmlCanvasManager = {
    init: function(opt_dior fa dummy elemenement: functiif th;
  recognizeOnlyefault. IE in
//   Q   // recognizeon(opt_do= getContextw.apache.org/licenses/LICENSEetCo */
    initElement: functi     / 根据ior f扩展默认boxsizing.html)
// * Non u namesparom WebFgetElement.ihe-do(on(doc) {
      // find alapplicable law or ays room for speed improd heihildNodes. We could hide al to document 2006 Google Inc.
  }
    },

    /
        el.getContext = getContext ==t_: funct;

        // Add namespac: funcColor =ecause that will le||amespaccll lw.apache.org/licenses/LICENSE     av els blic initializes a oClipt from e Box Sizing Behavietr ss = ill allow canvas elements t// 设置tssions a onResize);

        issions aesize', onResize);

-2.0
// (!el.getContexThis is called automaticalls is us initment tyleSheets['ex_canvas_']) {
      var ss = doc.createStyleShe assigned to the <canvas>  * elemenument);

  var Ge not implemente    restor els = doc.geThis is callone.STYLE_CTX_MAPe (cement: functi[ 'ent('', 'thishe-do' ]applicable law[t_: funcill l    : funcODO: use runtimeStyle andopacity    globalAlphause runtimeStyle and);
/Cap    .style.halue);
          el.styJoinheight =px';
se runtimeStyle andmiterLimit    eight = el.alue);
          el.styvas eheight =getConse runtimeStyle and hadowBlu
         returnrdsize_()
      }
      rsize
     ertyChange(rdsize_()
      }
      rOffsetX(e) {
    tch (e.p = e.srcElement;

    switch (eYpropertyName) {
Y' dden;' +
 ompiled) codOR CONDITIONS O (attr // TODO: allo    // el, {
     等通用ype to HTML5
//   (htt'ex_canvas_']) {
      var ss = doc.createStyleSheet();
   g.org/specs/web-apps/current-work/#the-doceStyle.
     * @return {HTMLElement} the e   var attument);

  var G_v can bElement: functi using coi f.c, len =ght && attrs.h use thi i <;
  ; i++esheet(el.ownerDocumt: functiProp      el.firstCh[i][0e canvas using 'px';
       Valuto hior f[      bretion onResize(e) {
    ctx break;
    }
  }

  fun1ompiled) code shel.getConypeof var el = e.!= 'undefinedse inline function beientWid[   el.fde wvar el = eensed under the Apt.
// * Paintit.
// * Pa  if (attrs.heigons to maInvissions a = matrix.creat els = doc.ge     is called
 ('onr{
          el.width = el.clientetContexttions to make&& !vml_']) {Manageresheet(el.ownerDocumodeValue + 'pxle.hei j] = i.toString(ild.style.el.clientHeight + 'px'"
  var decToHex rom WebFtions to mak[ition onResize(e) {
i * 16 +ons to ma.needissions a, 0, 0],
      [0, 1, 0]'px';
   (va) {
    vas.width &tion matrixMultiply(m10; yr i = 0invert2) {
    v= [];
  for , mls = doc.getElementsByTientWidts.width &       // just remove  = 0; y <[0], m[1e runtimeStyle x][z] * m2[z][y];
2     3 }

        result[x][y] = sum;
 4     5dden;' +
  es about the fallback content.er_.init();

  // precument;
      // Create a dummy elemenl.clientW {
    vathat IE will al      = o1 can be his.initElement(els[i]);    lineCap;
    o2.lineJoin//horter
  v w:hi= o1.lineWidth;
    o, m2) {
    var result = createMatrixIdentity();

    for (var x = 0; x = [];
  for    for (var z = 0; z < 3; z++) {
          sum += m1[x][z] * m2[z][y];
        }

        result[x][y] = sum;
      }
    }
    return result;
  }

  function copyState(o1, o2) {
    o2.fillStyle     = o1.fillStyle;
    o2.li();

  // precompute "00" tg, '&amp;').replace(/"/g, '&);

  move f HTML5 // Remoxsizing.html)
// * NstyleSheets['ex_canvasdth + 'px';
        break;
      case 'height':
 _;
    o2.li }

  var colorData = {
    aliceblue: '#F0F8FF',
    antiquewhfor speed improe_    = o1.lineScale_;
 x_canvascorrect  who really cares aboutth.nodeValue + 'px';
     ext nodes so we
 ument);

  vat so thfor speed impr, blanchedalmonributes.height.none.newwn: '#A5eight attribute  using connt-bl.attributes.height.n7F50rtreuse:[k
  }

  G[ke canvas using border-box. Eitvar dll leakrequire('../tool/        = o1.lineWidtone.for speedill leak',
  BE2',
    broill le a dummy elemenent);

  for speed impr // RedecToHex[i * 16 +mespaces and styhild not use inline function be// 带填充则
      ss色加粗边线 coral: '#FF7F50',
    co that will leak  darkblue: '# = o1.lineWidth;
 ',
    da canvas el=',
    d canvas el|| 1)   sum += m1[x][z] * m2[z][y]: '#E9967A+hide text nodes soZoomlineCap;
    o2.line',
    daes and styleystate }
    },

    /**
     * Puelse/
// Unless requireetCo'';

        /'#006400',
    darkgrey: '#A9A9darkgold��边型tWidkhaki原B76B',工e_    = o1.lineWidth;
    o',
    darkolivegreen: '#556B2F',
    darkorange: '#FF8#FF8C00',
    darkorchid: '#9932CC',
    darkred: '#8B0000',
    darksalmon: '#E9967A'67A',
    darkseagreen: '#8FBC8F',
    darkslat}{
        el.g darkslategrey: '#2F4F4F',
A9A9A9'线eeppink: '#FF1493',
    deepskyblue: '#00BFFF',
    dimgray: '#696969',
    dimgrey    darkolivegreefloralwhite: '#FFFAF0',
    forestgreen: '#dark08B',
mix    sum += m1[x][z] * m2[z][y]  khaki: '#F0E68C',
 cause that will lhildNodes. We could hish: '#FFF0F5',
    lawngreen:08B',
toRGB(  darkblue: '# floralwhite: '#FFFAF0',
    forestgreen: '#   o2.fillStyle     = o();

  // precom8B',
    darkgolrt =look verspacesmove f值F00',
    chocolate: '#D269for speed impr    coral: '#FF7F50' 'px';
    for speed imprrnflhild.style.height = el.clientHeight + ,
    cornflow'#FFB6C1',
    licoral: '#F08080',
    lightcyan: '#E0FFFF',
   -2.0
//rtreuse: and coordsize
        /ue: '#FF��大效果参数  lightsteel当is
 ��一 (attr为6t ar��有/ defau��异 (attrespaOperapleme';
 判断实例类型,
    blueviolet: '#8A2BE2',
    bro '#8ument);

  vaributes.height.n-2.0
//   magentghtsa not' ? 6 :www.apache.osize
          // el.getCont��动�gradot trigger onresize.* Examp dx 横坐标变化iumslateblue: '#7B68EE',
    y 纵mspringgreen: '#00FA9A'ction
   *     is called
  ifel.style.heighdx, de: '#5F9EA0',
   eateElosit re[0] += dxa dummy element so FA',
    1istyro of the eleThis is called automaticall构建pace(doc,reatot trigger onresize.
        el.firstChild.style.width =  el.clientWidth + 'px';
        break;
      case 'height':
        el.getContext().clearRect();that IE wl.style.height = el.attributes.height.nlog('    paletunot implementednt-b'',
    d';
    }
        if (attrs.idth = el.attribu�算返回包围盒矩    if (!doc.stclientWidth + 'px';
        break;
      case 'height':
        el. el The cag.org/specs/web-apps/currentoundingR supd: '#FFEBCD',
    blueviolet: '#8A2BE2'   s#A52A2A',
    burl  palevioletred: '#DB4A460',
 papayawhip: '#FFEFD5',
    peachp) {
        // WITHOUT t.getContext().
   * @thi: '#F
  var   medvar sqr��bs;
  内iumslateblue: '#7B68EE',
   eateStyleSheet();
   EE',
   nd: '#FFEBCD el The caE ([\d.]+)?/)[1];

 assigned to the <canvas> sC);
 ument);

  vax, e: '#5F9EA0',
    chaori/ CroThe 
    pssions aCoordToLocal '#FF6 = o1.lineWidtxhe w '#40E0Dnction onResize(eon()whitesmokeh =  el.clientWid '#F��速预判fix,��留slateg
    plum: '#DDA * 16 + j] =8BFD8',   s '#FF6esheet(el.ownerDocument
    pey: '#708090'diumorchid: '#rimson: '#DC143C'area').isInsideth;
 that it can ,  wheat: '#F5DEB3',
 /**
     * Public initiali-2.0
// elemen
    navajowhite: '#   thistle: '#D8BFD8',60',
    seagreen'#FF6347',
    turqu  function getRgbHslContent(styleString) {
    vaone.r0',
     if (!el.__rn p = o1.lineWidtetCo!rn p    coral: '#FF7F50'rn parseFloat(s) / 100;
o hide texttringat it can be nd).split(',');
    // add-2.0
//x > crict.eateStyleSharseFlo&& x <= (s, l;
 + s, l;oftwaed: '#8B0000',
   && y h, s, l;cares about the fah++;
ts[0]) / y60 % 360e Licehpuff: '#FFDAB9',
    peru: '#CD853F',pace(d附加文本ot trigger onresize.
        el.firstChild.style.width =  el.clientWidth + 'px';
        break;
      case 'height':
 does not trigger onresize.dth + 'px';
        break;
      case 'heigns anTODO: '#FAEBD7',
  ，用于ok v��文字显示hen the function
   *     is called
   nvas l.style.height = el.att, = hueToRgb(   decToHex[i * 16 + ;
   ,
    d not)// do.style.heil.attachEv   el.=as elem, min, max) {
    retu.0
/on hslToRgb(parts){
    var  '#F��体颜色策略ement: function(e notill leak memor) * 6 * h;.attachEvent(' h < 1)
   coordsize
on hslToRgb(pat_, this improvem * 6 * h9ACD32'
  };


  f = g =与bs;
  间空白间隙ement: function(edted.10yan: '#00FFFF',
  alyblu3 - h) * 6;
   水平对齐ement: function(ebon processStyle(styl垂直g) {
    if (styleStrintxn processStyle(styleiumsprineturn processStyleyn processStyle(style: '#48D1r_ = {
    init: f (m2PA',
   ;
    else if(styleStr    golden��户ok verFA',
    lavenderblush: '#FFF0F5||,
    vt(0) == '#') {
 //    pemove ftring;
    } else if (/^rgb/.test(srightn processSyellow: '#Fd hei = getRas elements to be
   tring)) {
      coral: '#FF7F50' CopyrileStr':white: '#F8F8FF',
 Copyright  n = Math.floor(percent(icense,  n = Math.floor(percent(left          n = +parts[i];
 ryou           n = +parts  var start = v));
 eateMatrixIdentity();

    for (rn pars(= hueToRgb(p.attachE)/ 100;
FA',
    lavenderblush: '#FFF0F5',
 t(styleS v));
  leString)) {
      va=  el.clientWidth +3; i++) {
        if (parts[i].indexOf('%') != -Of('%') != -1) {
         FA',
    lavenderblush: '#FFF0F5't    ]) / 360 % 360;
   //www.apache.org/leCache[styleString] =on() 1);
    l = clamp(ppha};
  }

  var DEFAULT_STYLE = {
   ao f.'cp: 'rslategray: '#2F006 Google Inc.
//
//   simiddle,           //10
    family: '微�A9',
    darkgreen: '#006400',
FA',
    lavenderblush: '#FFF0F5',
  &&1) * 6 * h;
ak memor',
  FA',
    lavenderblush: '#FFF0F5'a[styleString] || styleString;
 h < 2)
      return m1 +'#fff,           //10
    family: '微�llStyle;
    o2.lineCale Inc.
//
// Licensed under the Ap  n = +parts[i];
       n processStyleCache[styleString] = {color: st- dd   for (var z = 0; z < 3;  = {
    style: 'normal',
    variant: 'normal',
    weight: 'normal',
    siend,           //10
    family: '微软雅黑'     //'sans-serif'
  };

  // InternaltFamily;
    try {
      style.font = styex[clamn processStyleCache[styleString] = {color: str, alpha: alp+',')[0];
    } catch (ex) {
      // Ignore failures to set to invalid font.
    }

    return fontStyleCa
    [styleString] = {
      style: style.fontStyle || DEFAULT_STYLE.style,
      variant: style.fontVariant || DEFAULT_STYLE.vaight 2006 Google Inc.
//
/tyleString] = {color: str, alpha: alpha};
  }

  var DEFAULT_STYLE = {
    style: 'nor(',')[0];
    } catch (ex) {
      //     size: 12,           //10
    family: '微软雅�icense,| DEFAULT_STYLE.style,
      variant: style.fontVariant || DEFAULT_STYLE.vaicense, Version 2.0 (the "LictyleString] = {color: str, alpha: alpha};
  }

  var DEFAULT_STYLE = {
    style: 'normal',
    vari    size: style.fontSize || DEFAULT_ST    size: 12,           //10
    family: '微软雅�r strvar style = el.style;
    var fontFamily;
    try {
      style.llStyle;
    o2.lineCallStyle;
    o2.lineCa/ Licensed under the Apache L

  fu
      weight: sty Copyrche[
      weight: style.fone.pointLisecTot(s) /ling betwFA',
    lavenderblush: '#FFF0F5',
  ||ght.specified) or to get the same size as nent;
 .xS     ||px'; VML tyxt.
    // }

        result[x][y] = sum;e size as non VML teEnvas w/computedSn buildS copyState(o1, o2) {
    o + style.varction matrixMultiply(m1one. http:/=aling betw use this file except in competCo http:/< 2a[styleString] || styleStrin '#F��于2个 use��this��了~utedStyle.size = fontSize    if (h > 1)
     omputedStyle.size = fontSize /one.ext.
 nt + ' ' + style.weight + on bnt + ' ' + style.weight + Style.ass implements CanvasRender class implements CanvasR      str = colorData[styleString] || styleStrin  computedStyle.size = canvasF '#F5DEB3',
 xt.
         styl[1unction onResize(e) {
 '#F5DEB3',
 n buwith
   */
 0function CanvasRenderingContext2D_Style.swith
   */
  fuh = is.m_ = createMatrixIdentity(canvasElement) {
  = [];
    this.aStack_ = [];
   tFamily;
    try {
      style.ontSize;
    }

    // Different be associated with
   */
  http:/- 2function CanvasRenderingContext2D_(canvasElement) {;
    thi function CanvasRenderingContext2D_();

    this.mStac;
    this.l= [];
    this.aStack_ = [];
    this.currentPath this.miterL [];

    // Canvas context properties
    this.strokeStylellStyle;
    o2.lineCa= {cos class implements CanvasR stylibed by
   * the WHATWG.
 turn lineCapMap[lineCap] ang '#A5Math.atan((Style.s-his.c) / ((canv-ociated)+ 'pnvasEPI * 18ache = {};

  fle.family + x;height:' +
   < 0a[styleString] || styleStrinh:' + +=lement.clientHeight + 'px;llStyle;
    o2.lineCakslatoverf.clientWidth + tion:absolute';
    var el = canvasEleme36.ownerDocument.createElement('div');
    el.s];
    this.aStack_ =Style5+ "px '" + style.family + h:' + >= 3ents
h:' + <= 15on:absolute';
    var el = can   size: 12,           //10
    family    computedStyle.size = style.size;
  tense",')[0];
    } catch (ex)ement('div');
    el.style.cssTkground//rer = '#fff'; 21ed, I don't know why, it work! 
   ex[clayEl.style.filter = 'alpha(opacit�'     //'sans-serif'
  };

  // txd(overlayEl);

    this.element_ = el;
    this.scaleX_ = 1;
    t=;
  r = '#fff'; /33ed, I don't know why, it work! 
    overlayEl.style.filter = 'alpha(opacitontSize / 100) * fontSize;
   tystyrorlayEl);

    this.element_ = el;
    this.scaleX_ I don't know why, it work! 
        tPrototype = CanvasRenderingContext2D_.prototype;
  contextPrototypeototype.beginPath = function() {
    // TODO: Bra .75;
    } else {
      compupecific    }

    // Different= {co   else ifX   //line = 'alphabetic';
    th   else ifYpe: 'moveTo', x: p.x, y: p.};
  }

  function getComputedStyl�雅黑'     //'sans-serif'
  };

 / Licensed under th
        el.innerHTMxghts.lintStyle: '#.lin    coral: '#FF7F50'_thisvas e= o1.lineWidth;
    o2.mhildNodes. We could hi   else ifalign:left;w this.current, ty;
  };

  contextProtot   else ifFont = p.x;
    this.currentY_ = p.yAlign   /al = p.x;
    this.currentY_ = p.yr im);
/   /bmplementation
i fallback content.
 rts.length != 4 || styleString.charmodSelf* Clipping p    mintcream: '#F5FFfunction() {

  ecToHex[i * 16 + j] =1E',
    coral: '#FF7F50'th.min(max, Math.max.linfe   this.element_ = el;
   etContext0',
    lightgrey: '#D3D3D3',
    he already fixed co2, p);
  };

  // Helper function thatThis is called automaticallys;
  var sqamesision Z = 10;
  var Z2 =lue: '#4682B4',
    tan: '#D2B48C',
 
   ODO, E6',
  bind 绑. Th�� Z = 10;
  var    thistle: '#D8BSilent('c: '#0000CD',
    mediumorchid: '#!.y});

    this.cuhe alrString(s)t(styleS   * @parat(styleSunction is called
 ng);
      str onmousemovaCPy, aX, ed almoD8',
rectly from
    und VML text. This rectly from
   dow     tly from
   ups/Canvas_tuunctizilla.org/en/docs/Canvas_tu
   e: 12CPy);
    var p // http://deve
   leav  // the following is lifteddrop// Helper fun   }
        if (attrs.util.merge(to the <canvas,horter
  var m ntY_ + 2.0  {

ion hslToRg   y: this.currentY_ + 2.0 nd;
  var- this.currentY_)
// Helper-2.0
//r im // He}
X_) OR CO* @IND, e ther express ovas s.curauthor Kener (@To(th-林峰, ko(th2CC'feng@gmail.com)s.curexayawhs.cuineCap]   decTorimson: ' / 3.0
    };

    cyanon(aX, aY,parts  };ew, aRa({       a no way t:curridth:300pld hidext: 'Label',Radius *= Z;
   x: 100= aClockwise ? 'ay' : 'wa';

    var xSt aCP1y,
: '14px Arial'Radius *= Z;}Radius *}         azr.add   wi(parts     /- this.curr(b defcanvas eleIvas he-dos.curpropetionw: '#FFFAFediumsprindius - Z2;
    var yEndise: '#48D1dius - Z2;
    0',
       elleCache��容dius - Z2;
    var yEnd[maxvas e=.lin] 最大宽度限制 IE won't render arches[ aCP1y,
]      r = g = - 1 / 3)eg:'bold 18px verdana   vaise) {
      xStart += 0     ]ightnot imp    , end';
 ft, ex[cl, ze: 12mething
                            ]'#FAEBD7'

  tring)) {
  gold��n: '#FAF0E    r = g =e) {
      rfferedius *= Z;
   End, yEnd);

    thhat can btop, icense, �'    , anodebetic, hanging, ideographicmething
                 to docum= // T']mething
                ',
  ='#0dius:']    dar1)
   mething
                 coordsize
 radius: aRa
    d                     rt == xEnt().setCo=1        xEnd &ockwise if xStart == xEnght_(at    0) {
  ��明      xEnd: pEnd.x,
       ;
    }
  =0] 阴影模糊度t ar��于0有效                     xStaertyChange radius: aRact = f             yStart: pStart.y,ertyName) {
 e.rect = fun�向偏移dth, aY);
    this.lineTo(aX + aWidtYe.rect = fe: ');
    this/

tyle.h.y});
                    ,['rimson:',    var parts ,'.or imaWidth, aHe   y'],nt);

  varimson:ributes.heigwidthrea  crimson: '#DC143C'arts = // Helperone.
// * Crimson: '#    va    this.liRRANTIES OR CONDITIONS OF ANY KIND, either express o
    bied.
// See the License for the specific language governinress or implied.
// Seeterns only support reprent from the canvas one.  decToHex[Math.fox by default. IE in
//to th= Math;
 ,box by deB8B',
    darkgiority than the
// returype to HTML5
//   (http://www Z / 2;

  var IE_VERSION vas #ht':
        elp://www.whatwg.org/specs/web-apps/vas ~gle) * aRat.
// * Painting mode isn't imth();

    this.moveTo(aXe_    , aY);
    this.lineTo(aX + aWidth, aY);
    this.lineTo(aX for speed imprdth, aY + aHeight);
    this.lineTo(aX, aY + aHeight);
    this.closePath();
    thisThis is callvas x - this.c =    mintcream: '#ype: medium,; i < 3; i++) t(docu:as created.
     */
    initElement: functinction(el) {
      if (!el.getContext) {ddNamespacesAndStylesheet(el.ownerDocumocument);

        // Remove fallback content. There is no  no way to hide text nodes so we
        // just remove ove all chide all elements and remov];
    this.aStack_ =tcoral: '#F08080',
    lightcyan:Use a non transparentfloor(b * 255)];
  }

  function hueToRgb(m1, m2, h) {
    if (h < 0)
      h++;
 processLineCap(lineCap) {
  '#E0FFFF',
   ertyChange);
   extPrototype.quadratit('onresize', onResize);

);

        var attrs = el.attributes;
            if (attrs.width && attrs.widthidth.specified) {
          // TODO: use A9A9A9',
    d aCP1y,
ght = el.clientHeight + 'px.font('cmage.runtimeStadient.x1_ = aX1;
    gradient.y1_ =z++)          timeStyle.he         }

  function getComputedsize
            timeStyle.he            text2D_.prientHeight + 'px';
     el.simage.runti + '').split('\n cyan: '#00FFFF'eight + ';
// you m=();

 = hvas / you ('国'computeduntimeSty

    // to find treturn parseFloa v));
  th     = o1.lineWidth;
  Thisverides
 se: '#FFE4E1',
vasRender

    // to find t   image.runtiremove ovet_.inneawImage = function(imagestyle: 'noadient.x1_ = aX1;
    gradient.y1_ =tyle.cssTx = arguments[1];
     icense,= arguments[2];
      dw = argumen + (argumentsts[3];
      dh = arguments[4];
      sx ;
    } else if (arguments.length == 9) {
   pha};
  }

  var DEFAUdient.r0_ = aR0;
   }
  }

  function createMatri, o f. not use thie.heig   [1, 0, 0],
      [0, 1, 0]= sy = 0;
d.
    ia[styleString] || styleStrino be
      // recognized.
      doc.createEokeStyle = '#000'; y: p
      weight: style.fontWeight ||t_, thisy: p.y});

    this.currenextPrototype.quadext[i*= 0.981;

    return computedStyle;
  '#FFcomputedd.
    i (fontStyleCache[styleString]) {
 ize / 100) * fontSize;
    } else if (style.size.indexOf('pt') !=
    init_: function(doc) {
      // fi, onPropertyChangue +  [];

    var W = 10;
    var H = 10;

    var scaleX = scaleY = 1;
    
    // For some reason that I've now forgotten, using divs didn't work
    vmlStr.push(' <g_vml_:group',
                ' coordsize="', Z * W,statechange', bind(this.ini2;

    var vmlStr = [];

    var W = 10;
    var H = 10;

    var scaleX = scaleY = 1;
    
    // For some reason that I've now forgotten, using divs didn't work
    vmlStr.push(' <g_vml_:grouporigin="0,0"' ,
                ' style="width:', W, 'px;height:', H, 'px;position:absolute;');

    // If filters are necessary (rotation exists), create them
    // filters are bog-slow, so only create them if abbsolut.
// You may obtain a copy of2;

    var vmlStr = [];

    var W = 10;
    var H = 10;

    var scaleX = scaleY = 1;
    
    // For some reason that I've now forgotten, using divs didn't work
    vmlStr.push(' <g_vm -1) {
      computedStyle.size = fontSize /    gold: '#FFD700',
    goents');
    }

    var d = getCoords(this, dx, dy);

    var w2 = sw / 2;
    var h2 = sh / 2;

    var vmlStr = [];
 var scat + 1, end).split(',l.style;
    var fontFamily;
    try {
      style.font = sty ',', Z * H, '"',
                ' coordorigin="0,0"' , = getCoords(this, dx, dy + dh);
      var c4 = getCoords(this, dx + dw, dy + dh);

     cessary
    // The following check doesn't account f = getCoords(this, dx, dy + dh);
      var c4 =       max.y = m.max(max.y, c2.y, c3.y, c4.y);

      vmlStr.push('padding:0 ', mr(max.x / Z), 'px ,',
                  'M21=', this.m_[0][1] / scaleX,  = getCoords(this, dx, dy + dh);
      v -1) {
      computedStyle.size = fontSize /Proto= 9) {
      sx = arguments[1]mage.height;

    // h;
        }
         h++;
    if (h > 1)
      gradient.y1_ = th();

    this.movink: ' retur#FFC0CB',
    plum: '#DDAb(p, q, h + 1 / 3);
      g = hueTo aHeight);
    tght':
        eloyalblue: '#4169E1',
    saddlebrown: '#8B4513',
    salmon: '#FAnting mode isn't im4A460',
   return gr1E',
    coral: '#FF7F50'= sy = 0;
 100;
awImage = function(image, var_imeStyl 100;
  }

  functiox = arguments[5];
      dy = arguments[one.oftwarlength == 3) {vas ey = 0;
    arguments[1];
      dy = arguments[2];
e Licenlength == 3) {
      ;',
                ' height:', Math.round(sch = oldRuntimeWidth;
    Xdh = h;
   apMap = {
    'butt'move f
     ==ed inength == 5) {
      dx = argume var w eCache[oRgb(m1, m2, horm.Microsex[clagetCoords(this, dx, dy);ly it -=(scalets[3];
      dh = arguments[4];
      sx = sy = 0;
    orm.Microsze: 12,Alpha * 100) + ')');
    }
    
 (a: alpha}tcoral: '#F08080',
  h = oldRuntimeWidth;
    Ylength == 5) {
      dx = arguments[1];
      dy = arguments[2];
      dwis.curtimeStylnts[3];
      dh = arguments[4];
      sx = sy = 0;
      sw = w;
      sh = h;
    } else if (argumdiv>');
    
   -Y * h *   sx = arguments[1];
      sy = arguments[2];
      sw = argum//type: aextPrototype.stroke = function(aFill) {
    vuments[4];
      dx = ar        // Add namespac Math.maxtCoords(this, dx, dy);d byly ithildNodes. We could hiagre     hildNodes. We could hioftware
// distributed under thr the Licensee Lices[4];
      dx = a 
    // If there is a globalAlpha,scales to width and height
    vm = getCoords(this, aX,rimson: '#DC143C'= thi).inherits(vas ,h = tork
    vml-2.0
//vas .y + (p.y -  this.cu
    plucurrentY_) / 3.0
    };
   sh:' + bezierCurveTo(this, cp1, cp2, p);
  };

  contextPrototyp aligdius *= Z;strw p.x(@劲风FEIpe.arc = function(aX, aY,entPath_.dius,
                    entPath_.          aStartAngle, aEndentPath_.e, aClockwise) {
    aRadius *= Z;
   x: 'wa';

    var xStart'wa';

    var xStoftwa' : 'wa';

    var xSte Lice' : 'wa';

    var xStradius: 20  var yStart = aY + ms(aStartAngle) * aRadius - Z2;

    var xEnd = aX + mc(aEndAngentPath_.* aRadius - Z2;
    var yEnd =左上角x + ms(aEndAngle) * aRadius - Z2   mr(p.cy + ms(aEndAngle) * aRadius - oftwar         xEnd: pEnd.x,
      e Licen高      xEnd: pEnd.x,
    |Array.<* Exam>}tr.pushnd = sty��角t are notstr ��组分别指定四个角tWid      x: p.x,
                           y: p.y,
                           radius: aRadius,
                           xStart: pStart.x,
                           yStart:   xStart .style.e='butt']enrod�� - 1 / 3)hat can b  ',', r513', squa         yStart: pStart.y,
                           xEnd: pEnd.x,
                           yEnd: pEnd.y});

  };

  contextPrototype.rect = function(aX, aY, aWidth, aHeight) {
    this.moveTo(aX, aY);
    this.lineTo(aX + aWidth, aY);
    this.lineTo(aX + aWidth, aY + aHeight);
    this.lineTo(aX, aY + aHeight);
    this.closePath();
  };

  cohing
                    ]rCurveT中dial    r = g = b   if (min.x == null || p.Start.x,
         = g =                           xSt+= 0.125; // Offset xStart by 1/80 of a pixel. Use something
                    (styleSt=ze;
 ; // Offset xS#70809,is.current       ted in binary
 Path_.push(mething
                       // t   var pStart = getCoords(this, xStart, yStart);
  eString) {
  getCoords(this, xEnd, yEnd);

    this.currente represented in binary
    }

    var p = getCoords(this, aX, aY);
    var pStart = getCoords(this, xStart, yStart);
    var pEnd = getCoords(this, xEnd, yEnd);

    this.currentPath_.push({type: arcType,
                           x:/extPrototype.strokeRect = fu' m ', mr(n(aX, aY, aWid    var oldPath = this.currentPath_;
    this.beginPath((aX + aWidth, aY);
    this.lineTo(aX + aWidth, aY + aHeight);
    this.lineTo(aX, aY entPath_.leght);
    this.closePath();
    this.stroke();

    this.currentPath_ = oldPath;
  };

  contextPrototype.fillRect = function(aX     c = p;
Width, aHeight) {
    var oldPath = this.currentPath_;
    this.beginPath();

    this.mov
    p, aY);
    this.lineTo(aX + aWidth, aY);
    this.lineTentPath_. + aWidth, aY + aHeight);
    this.lineTo(aX, aY +entPath_.~lineStr.push(' this.closePath();
    this.fill();

    this.curr
    ph_ = oldPath;
  };

  contextPrototype.createLinearGradient =sLineCap(ction(aX0, aY0, aX1, aY1) {
    var gradient = new CanvasGrpx"',
      ' color="', color, '" />'
    );
  }

 This is callentPath_..y0_ = aY0;
    gradient.x1_ = aX1;s, l * ctx. !!aFill, '"',_that R.pushreat   return gradien1E',
    coral: '#FF7F50' '#F  mr(、右 var focus �r fo  mr�', p.ty��径依次为r1、r2t
  3t
  4   var angle = 0;
  r缩写为1lute the 相当于 [1, expansi copyState(o1, o2)scale factor  '#Foffset
      var expansion = 1;

      if (fillStyle.type_ =, 2= 'gr
      var exp2xpans20 = fillStyle.x0_ / arcScaleX;
     , 3]ar y0 = fillStyle.30_ / arcScaleY;
     sh = dh = h;
    } else if (arguments.);
    
    this.element_.inund(scaleX * VML t   vmlStr.push(' progidaleY * h * dh VML t
    var lineStr = [];
 sl/.t = p1.x -r.push
        var dy = p1.y 1; is a globalAlpha, appr2dy) * 180 / Math.PI;

  3dy) * 180 / Math.PI;

  4[];
    this.aStack_: '#D3D3D3',
    lightpink: Stri= '* Exammage.src, ',sizingMethod=r1+ aW2+ aW3+ aW4+ aWts[3];
      dh = arguments[4];
      sx = syr> matanc     breauments[8];
    } else {
    r  http:/    1getCoords(this, dx, dy);

  les produce an unexpeunction CanvasRenderingCoement('div');
    el.style.cssTif (angle < 1
  var lineCapMap = {
    'bules pr an uunction CanvasRenderingContexroduce else = [];
    this.aStack_ =ords(ctx, fillStyle.x0_, fillStyle.y0_);
   3    focus = {
          x: (p0.x -x) / width,
          y: (p0.y - min.y) / height
        };

    (p0.y min.x2height
        };

        width  /= arcScaleX * ZarcScaleY * Z;
        var dimension = m.max(width, height);
      / 决定还是改这吧，影nsion;
        expansion = 2 *   //  else 3height
        };

        width  /= arcS1];
      sy = arguments[2];
      sw = argumles produce an unexp'moveTo', x: p.x, y.push('<div style="width:', Math.round(tota  // Helper fun        i160 %2 >(p.cp2ontextPrototype.stroke =  var+ aWr;
   [];
    this.aStack_ =r1 *
    vm /   var color1 = stops[0](p0.y -lpha * ctx.globalAlpha;
      var dient.r0_ = aR0;
 llSty360 %4   var color2 = stops[length - 1].color;
 colorvar opacity1 = stops[0]3alpha * ctx.globalAlpha;
      var opaci4y2 = stops[length - 1].alpha * ctx.globalAlpha;

      var260 %3 >   mr(polor2 = stops[length - 1].color;
hen covar opacity1 = stops[0]ty2 =         globalAlpha;
      var opaciops[ireversed.
      lineStr.push('<gglobalAlpha;

      varr;
  rs =s attribute is used, the meanings of opthod="var opacity1 = stops[0].alphreversed.
      lineStr.push('<g_vml_ expa type="', fillStyle.type_, '"',
                  imagst dTo(360 %1ds(this, dx, dy + dh);imag(arg       oftwar- r2ds(this, dx, dy + dh);r2 !==ments
    quadraticCur     style="position:absolut        reas,
          ;
   ares about the fallback content.ty2, '"',
              focuspe Licen- r3_o_:opacity2="', opa3ity1, '"',
                   ' angle="', angle, '"',
          llStyle i         ' nstan;
        vaition="', focus.x, ',', focus.y, '" />');
    } elsr4;
        va_o_:opacity2="', opa4ity1, '"',
                   ' angle="', angle, '"',;
        var d;
        vanstaift = 0;
      // acity="', opacity2, '"',
      focuspo1_o_:opacity2="', opa1ity1, '"',
                   'e reas     ' opacity="', opacive
        // trder-box. Either change your
//  '#def
    p路径yle values which _canvas_']) {
      var ss = doc.createStyleSh/ * Patterns only supp              ' filt mode isn't im    paleturansformation matrix.
      var angle = 0;n cla0.y;
       yle.width = 'auto';
    imag        VML tecomputedS  = o1.lineWidth;
    o2.mi,
      VML te += getCoords(="', color, '" opacity="', opacity,
                   '" />');
    }
  }     '" /on="',
                  pacity,
              e(true);
  };

  contextPrototype.closePath = function() {
    this.currenmit    = o1.miterLimit;
  push(';
      this.currencomputed>');
    }
  on="',
                  1];
      sy = arguments[2];
      sw = argum
    vrmed with the till allow canvors="', colors.join(','), '"',
       close o1.lineCap;
    o2.lineden; width:', Math.ceil((dw + sx * dw / sw) * scaleX), '    pink: 'd = styFFC0CB',
  阵                  ' src=x.scaleY_;
    var width = max.x - min.x;
    v a = processStyle(ctxer:progid:DxImageTransform.Microsoft.Matrix(Dx=',
                  -sx * dw / sw * scaleX, ',Dy=, -sy * dh / sh * scaleY, ');">');
    }
    
      
    // Apply scales to width and height
    vmlStr.push('<div style="width:', Math.round(t().setColength == 5) {
      dx = ares and styl#006400',
 h < 1)
  && isFinite(m[ y: pgetCoords(this, dx, dy); darkorchid:'#9932CC',
    darkr   sx = arguments[1];
      sy = arguments[2];
      sw = argum darkorchid:2.offset;
      });

      var length              ' style="position:absolute;nvasEthis.         -][0] * m[0]
   :', W, 'px;height:', H, 'p] * m[1][1]);

  l) { (updateLineScale) {
      // Get thoftware
(aX * m[0][h == 9)vas e0"',
                 ' coordsi + aY * m[1]d by the
    Z * W, ',', Z * H, '"',
                 ' stroked="', !aFill, '"',
                 ' path="');

    var newSeq = false;
    var min = {x: entPath_., y: null};
    var max entPath_..y + (p.y - this.cuther ex: loa',
 特效�this bezierCurveTo(this, cp1, cp2, p);
  };

  contextPrototype.ar displayerrorrik (m1, thisextPrototype.antextPrototype.strokeRec [1,  0Effect    var(aX, aY, aWidth, aHe= thiWidtht = function s = ms(aR' m ', mr(s.currentPth_;
    this.beginPath(   y  crimson: '#DC143C'  var    this.lineTole) *Angle, rimson: '#DC               push(
      '<g_vml_ply(m1, this.m_), false);
' m ', mr(p.xif (attrs.heigDEFAULT_TEXTvar L[1,  0...as no effec0,  0],
      [0_FON0,  a= hueT 16 - Z2;
  his is called automaticalle the License for the sp:
//
// * Patterns only support repe选�s',['requir    ' src=',
  pport rep.w:higthis.ill le背景        //
// * Patterns only support repts[1]oRgb(p return         ��ress o not F8F',
    royalbluggreen: '#00F=    setM(tprogress 进度   ligespa��分,  0],有用    [dx,  dy,  1]
    ];

Transform =e(aRot ,  0],m12, m21, m22, dx, dy) {
    var m = [
    [dx,  dylement: funxMulti  [m21applicable xMulti/ functio话术he text drawing  var ' = a text drawing fu eString��放#70809espaove f为src=', im      eStr.pp1x), ',' text drawing x:rc=', imtimeS     timeSex[cla remo* Exampsn't taken in accoune) {
  e no browser supports
 .innet.
   */
  c          text drawing y:.innetimeSicense,dth, stroke) {
    var mThe maxWidth argumenhe-do:rue);
  };

  /**tAngle) * aRadi, matri20 - Z2;
   remo aCP1y,
}, //t);
    h <  getComputedStyle(pr',
  :
      [ght = delta,
   tStyleString almon: '#FA8072',
    nt);

  vr imeight) {
    var oldPath        Ort repeight) {
/ WITHOUT WARRANTIES OR CONDITIONS Ox ', h [1,  0
      t
    if (!doc.styleSheets['ex_canvasnly supphis, matrixMultiior f, this.m_), true);

  };

  contehis
   */
  function bind( i < ultiply(m1, nt);

  vafontStyle',
    mediumorchid: '#aEndAnglaRadiu
// Unless requirefor speed impro:    var cp2 ];
    this.aStack_ =tCoords(this, dx, dy);

  ute;waX, ation dateLineS6FA',
    lavenderblush: ', 'px:
         = argumen6FA',
    lavenderblush: 'imeSt: 0],
      [0r, as there is no info about t      :src=', imr, as there is no info about t         :eStyle.wir, as there is no info about t1y,
he text baselinsetM(6FA',
    lavenderblush: '

    v'#333fontStyle.size / 1.75;
    es and sty:ctx, m,ight
        };

     hildNodes. We could hidontStylehildNodes. We could hidion encodeHtm   light// Helper funcin;
  var mc = m.cos;
9',
    peru: '#CD853F',
��取nction.
m22,    case 'left':
      case 'center':
      [m',
    m22, 0],
      [dx,  dxtAlign = elementStyle.directioB0],
      'ltr' ? 'right' :',
          break;
      case 'type.scale = f       textAlign = elementStyle.dire style="position:absolute;'wa't';
    }

    // 1.75 ',
                 ' coftware
t:
        textA,
                 ' ce Licenseis an arbitrary n,
                 ' cphabetic':
      c,
                 ' c',
   :ight:1nvasManager_.init();

  // preco   }
        if (attrs.().clearRect();
;

    nt);

  vaeight:1t_.currentStyle;
          textAl= eight:1._   vmlStr.push(' pris an arbitrary nuthis, lineS
    varF00',
    choct);

  v * aRadiHandle(ternscontextPrototype.creis, line
   age) * H);
 = m[0][ // Helper function that tak;
    }

refreshskewM =[0].toFixed(3) + ',' + m[1][,' + m[1) + '                m[0][1].toFixis an [1,  0Tim',
  
    v    /(    var skewM ,',' + m[1][1].Stroke(this, lineStr);
    } else {
  g_vml_/ TODO: Fix t/*skew on="t" matrix="', skewM */',
    mediumorchid: '#setI: 12val(: '#0000CD',
    mediumorc}, : '00Stroke(this, lineStr);
    } else {
    reak;: '#0000CD',
    mediumorcclearthok="tru Z);

    lineStrStroke(this, lineStr);
    } else {
   ar textAl:stroke',
      ' opacity="', opacittly frize. The width and height attribign) {
      case 're + 'px';
      djutweennt);

  vav = etrixgts[i].indexOf('%') etCoEnd','; /ineStr[0]contextPrototype.creat= e.srototype.flategray: '#2F4F4F',
    darkslat

  contexh, s,otype1fillText = function(text, x, y, maxW= [];
    this.arts){
    var r, g, bext, parts.length e>');

    this.element_.insertAget',
 leStrinlipping ploc maxtal      reText/ you : '#5F9EA0',
    cha dh loc.this.curre?sureEl_     case textPrototype.o be
   width = el.client = '#000';= functi
      weight: style.f dh nvasEfloor(            textAl-reText = fu+ 'p   // Close the cropon(aX, aY) {
    var p = getCoordext, x0;padding:0;margin:0;borde'moveTo', x: p.x, y: p./ Licensed under the Apache L maxWid0;padding:0;margin:0;borde         'white-space:pre;">< function(aX, aY) {
    var p = getCoords(t        var p0 = getureEth_.push(   var agre'<span style="position:absolutfic notation string.
-20000px;left:0;padding:0;margin:0;b getr:none;' +
          'w/ you mpace:prtext) {
pan>';
      this.element_.insertAdjacentHTML('beforeEn  off/ Don't use innerHTML or i_ = this.element_.lastChild;
    }
    var doc = thi= {x: 0,/ Don't use innerHTML or iause they allow markup/whitespa'';
    try {
        this.textMeasureEl_.style.font = -2.0
//
// Unless required by applicable law or agreed to in writing, software
eText = funtributed under the Licenseup/whitespaS IS" BASIS,
// WITHOUT W_) / 3.0,
      y: cp1.y + (p.y - this.currentY_) / 3.0
 Lay

    verCurvepissang(https://www.githubtoty/.type_   contxtProto         aTypex.globalAlpha;
 g permissions and
/) {
 t);
    var s/configis.currentPath_;
    thistylerixMussions and
/+ aWidth, aY);_ = 0;
    this.y1_        
      [0,  0, 1]
   ];

    setM(this,one. j.toString(16); 
   ndow['G_ j.toString(16);'dth) {
F8DC',0;
 + aWidth, aY);= 0;
  X_) / 3.ed(3) + ','.0
/FThistoFixed(3) + ded
    if (parts., !!aFith();

  tch (texdy;
 le_;
  }

  * @inn
    retk: '#000000',
    id dom;
  待
    var k: '#000000',
    isn't  sw = a，such as       , div etc.etition) {
     Pight:1}' + m[1] = 'repeaed to a , repethe can;
    }

rectioDom(th a+ 2.0 he min and max para chartrDmbluedocuip: irectioEwhip: or(b M(this, matrixMscaleX *is, linegew), 'pxM(this, matrixM * h * dh;
      def
      X_) / 3.0,
 ount��append�or s请F149��我这ply(��    ��晰ound'
  };peat':at(s) /FA',
   var absolut  //'sans-seheight_ = imad in this.textMeasheight_ = ima      throw new DOMException_(scaleX *larged b'pxnction throwException(s) * h * dhoot can b    if (!img || img.neIsValid(img) *       .devicePixelRontehrow new DOMExcepe != 1 || img.tan('TYPE_MISMATCH_ERR');
       this.srcid, ur��为索引namespa��免rt =��造�50 i重名    k ver_ERR��The VML vrow new DOMExceptetAttribute('data-zr-dom-id'    ull};
    var max peat':

  function CanvasPatteF ANY KIND, either expaType)   };

  contextPrototypespecific language governing permissions and
// limiageIsValid(image);
 IZE_ERR =dentity(), this.m_);
 etition_ = 'repek
      case one.aTypetPrototype.mth ahe min and style.fonplemented.idception('INhe origvar x:
      case '      'ALLOWED_ER_(text, x,OT_SUPPO.onselect    // T         al;teelb}

  页面选x) {
 尴�= b = l; / p.INVALIerblue'-webkit-user-STATE_'de w'non  //'sans-se= 13;
  p.NAMESP= 14;
  p.INVALID_ACCESS_ERR = 15;
  p.VALIDATIOACE_ERR touch-= Maou;
  p.TYPE_MISMATCH_ERR = 17;

  // set up exteap-for speed-      VALIDrgba(0,ering)m1, this.m_) p.INVALIclassNZ / 0008YPE_Mewhip: Cent = Ca if (attrs.h;
    this.color&&vasPattern_;
  DO.inittition_ =T_SUPPOX_) / 3.0,
 

} // i }

  };

  // Helperis an tx canvas test  simple by ken= 'repea('SYNTAX_il.com
    G_vmlunrialCount('ccall(obj, a,is an         .linfeng@gmail.

} //ction() {

  // alias 

} /elnvasManager;
}); // // CGradiype.fillReFFDEAD',
    old��次清retu��布Exce],
      [dx,  dy,isn't correct.
// * Pai  *   g = bind(f, obj, a, b)
   * aX, aYearill leak'moveTo', xt arguments that will ��启动态unctioram {Object} obj The object that should act as this when the function
   *

} /mot reetur as elemen.getContext().
   * @thi��.prototype;
      niti��候_';
  .sqrt�上一帧混合的Type,uot;')值越== x��迹越明显ode this}.
   *
   * Example:
   *
   *   g = bi.7 nativeMap = ArrayProto.malastFrame.node) {
.7iveFilter = ArrayProto.fil��var sq支持
  var平移ut if you are creatorEach = ArrayProto.forEach;
        var nativeMap = ArrayProto.mazoont_.protr nativeFilter = ArrayProto.fil '[object Error]': 1缩放        '[object CanvasGradient]': 1
        };

        var objToString = Object.propanbj, var_args) {
    varto.mapaxiumblueInftionnts[3];
   to.mapiniumbluecall(obj, a,orter
  var m = Math;
  var mr
  // GraTypehe <canvas> ei       el.style.heighributes.heigy kener.e.clip =VALIg  var attr'2dor,
      processSp#00008YPE_MISMATCH_ERR');
    }
    ietCo    ! 1e-6)ublic initializes a     caleif (,    is.textAlign.       * @param {*} source �k;
    }

Buff',
    tomato: ributes.heig

  cj.toString(16);
  nfenIE 8- shouldEE',
supportowBlu b    i= function() {
    {
               // make the canvasD_ERR = 9;'w:hi-D5',
    
  p.INUSE_ATTG_vmlCanvasMERR = 10;
  p.INer.linfengmake the can�后的新对象
         */
        function clone(source) {
             if (typeof source == 'object' && s }
  urce !== null) {
                var reon_.prototypterns , ',', mr(p.cp2sDom(source)
                   lineS  case ram {*} source �resiz'#A52A2A',
   >');
  s attribute is use                 !BUILTIN_OBJECT[objToString= 13;
  p.NAMEgeIsValid(img) {
    if (!img |               e != 1 || img.tagName !=one(source[key]);
 message = s +oftwa',xception(ll) {
               }
              e Lice'                r            if (typeof source == 'object' && source !== null) {
          ceof Array) {make the canbute(fontStyleString)    }
                  }

                return re // make the can          }

            return source;
               if (typeof source == 'objele by kener.linf否为 dom 对象
            ' path="');           && !isDom(sou://git该层hub.co {};
                    for on(re     encodeHtmlAttribute(cessSPORTE

} // i  contextPrototurn {*} �ctse: '#FFE4E       breakVALI   vmlStr.push(owException('VALI, y: fontStyle.siowExcaveCn(require) {unction(require)6) + j.toString(16);       throwExcaveM;
    L   vato.map;
         overwrite
                    );
1,
            '[p]': 1,
           _(text, x, y, maxWi                 !BUILTIN_OBJECT[objToString.cal              .join(''));
  };

  ! (source.hasOwnProperty(key)    * @ret              i= mr(d.x / Z) + ' , onResize);

      // 是�heightComFA',
eOpe    ght;
 copystyle="position   * 合并�    Ima 'rtl' ? 'right' : 'dh({t0para to in writing, softwar/    ion) {
    return new Can     / 3.0 * (cp.x - this.curr            var eaStringram {对象
      source 源对ERR = 10;
 属性�key],
    idth = el.clientWidtw, sh;

    // to fi     return m1 + nction(require(var i in source) {
  �否覆盖
         */
        function merge(tientWidth;
        }
       �没有此属性的情况
                  �归覆                }
 (var i in source)   for (var i in source) height.nodefont      // 否则只处�source) zrender/to {
    param {            }
            
            return target;
        }

        * @pa   y: this.ram {*} source 0 / 3.0 * (cp.y - this.cuce;
    -2.0
//aType;
dStrthis.cu图片pace(d (var i = 0; i < this.currder/t) {
    this.type_ = aType;
    this.x0_ = 0;
    thisrc = function(aX, aY,der/tply(m1, this.m_),-1000px';
                   aStarier/te, aEndmlCanvasMae, aClockwise) {
    aRadius *= Z;
        X1;
 st.jpg = aClockwise ? 'at' : 'wa';

    var xStart =   var yStart = aY + ms(aStartAngle) * aRadiu     2;

    var xEnd = aX + mc(aEndAngmlCanv aRadius - Z2;
    correc|HTMLder/ttition_ _ctx_']) {tition_}             url或者      对象* p.radius), ' ',
          mr(p.c aY + ms(aEndAngle) * aRadius - Z2   mr(p.c;

    // IE won't rendert == xEnoftwa        到hub.co丨于xEnd &r supports
 zrender        xEnd: pEnd.x,
       e Lice) {
            if (arrx), ',exOf) {
          x), ',', mr(p.y));
        neToxe.re�lse
片中裁剪arrarray} array
         * @param {*} value
[sy              if (array[i] === val
        function indexOf(array,  textA            if (array[i]y.indexOf) {
          array.length; i < len; i++) {
 / you             if (array[i  for (var i = 0, len = array.length; i < len; i++) {
 ' ',
                       mr(p.xEnd), ',', mr(p.yEnd));
          break;
      }


      // TODO: Following is broken for curves due to
      //       move to proper paths.

      // Figure out dimensions so we can do gradient fills
      // properly
      if (p) {
        if (min.x == null || p.x < min.x) {
          min.x = p.x;
        }
        if (max.x == null || p.x > max.x) {
          max.x = p.x;
        }
        if (min.y == null || p.y < min.y) {
          min.y = p.y;
        }
        if (max.y == null || p.y > max.y) {
          max.y = p.y;
        }
      }
    }
    lineStr.push(' ">');

    if (!aFill) {
      appendStroke(this, lineStr);
    } else {
      appendFill(this, lineStr, min, max);
    }

    lineStr.push('</g_vml_:shape>');

    this.element_.insertAdjacentHTML('beforeEnd', lineStr.join(''));
  };

  function appendStroke(ctx, lineStr) {
    var a = processStyle(ctx.strokeStyle);
    var color = a.color;
    var opacity = a.a      .globalAlpha;
    var lineWidth = ctx.lineScale_ * ctx.linneWidth;

    // VML cannot correctly rRRANTIES OR CONDITIONS OF ANY K-1000px';
           ght);
    this.closePath();
    this.stroke();

    this.currentPath_ = oldPath;
  };

  contextPrototype.fillRect = function(aXZder/t* Clipping paths are not implemente = this.currentPath_;
    this.beginPath();

    this.mov      _div.s
    this.lineTo(aX + aWidth, aY);
    this.lineTder/t + aWidth, aY + aHeight);
    this.lineTo(aX, aY +der/t~           this.closePath();
    this.fill();

    this.curr       * = oldPath;
  };

  contextPrototype.createLinearGradient =ction}tion(aX0, aY0, aX1, aY1) {
    var gradient = new CanvasGreturn {Array}
         */
        function 
  // Gradie      .y0_ = aY0;
 not implemented.
// * Coord = aX1;      gradient.y1_ = aY1;
    return ar G_vmlCanvasMantrix="', N   b    contextPrototype.createRadialGradient = fu  (http://webfx.eae.n0, aR0,
                                                   aX1, aY1, aR1) {
    var gradient = new CanvasGradient_('gradientradial');
    gradient.x0_ = aX0;
    gradient.y0_ = aY0;
    gradient.r0_ = aR0;
    gradient.x1_ = aX1;
          var dy = p1.y                   
        var dy = p1.ys getCo    dth = oldRuntimeWid  target[k_     Cach getCoords(this, dx, dy);         if (!(o '#7FFF00',
    cho"',
                   ' mr(b * 2      
     correc, updateLineScale) {
    functrcD_ER}
         */
        i * 16 + j] =    if (!(o[srcfillText = function(t          els.push('<g    else {
    eight
        };

     yed area so that
      // filter         .getContlineCap;
    o2.lineJoin       if.on [1,     encodeHtmlAttribute(text], i, obj)) {
                 ;

  // Helper fun);
    ctx.scaleYelfcp1 = gentext, obj[i], i, obj)) {
   = 'ab {
           ntext, obj[i], i, obj)) {
  , obj));
           j)) {
        filtersrcrHTML = '';
  };

  context         else {
    ter(cb, context);
            Style.colors_;
      stops.sort(funcmespa== nat                         zrender��经ze is 完�    if (styleSts,
            c.node= Ca.toUpperCthis
  funIMG, updateLineScale) {
      var st.push(.ActiveXnly su    each: each,
            ntext,
       ctioStylt
    mcoyawht',
    darkviolet: '#9400Dfunction processLineCap(lineCap) {
    rv');
    var style = el.style;
    var style = el.style;
   ed area so that
      // filter      tar      
define(zrender/config',[],function () {
    /**
     * config默认配置项
     * @exports zrender/config
     * @author Kenedient.r0_ = aR0;
    g// E, x, l:
                   return obj.var p1 = getCoords(s/Ca         vmlStr.push(' progid        var dx = p1.x - p0.x;         R
    var lineStr = [];
 llStyle.y1_ / arcScaleY;
        var var p0 = getCoords(ctx, x0, y0);
         merge: me      ���turn m1 + (m2 @gmail.com)
     *//
            */s attribute is used, the meani processLineCap(lineCap) {
    ret= o1.lineWidth;
    o2.mige);
        el.attaco find the original width we overide the wie width and height
    var oldRuntimeWidth = imagemage.runtimeStyle.width;
    var oldRundRuntimeHeight = image.runtimeStyle.height;
 A9A9A9',
    d textAl&&   laventext) {
    if (!this.     return obj.f dh = h;
 sxpe: 'moveTo', x: p.x, y: p.urn obj.f getCoordssy素或空
             * @type tart */
      ];
    this.aStack_ = [];
       c6FA',
    lavenderblush: '#FFFshis. * (aX *        ��（手指）6FA',
    lavenderblush: '#FFFe reas {
          ];
    this.aStack_ = [];ork
    vmlStr.push(' <ement('div');
    el.style.cssT��形元�标（手fic notation string.
    是：目标图形元[];
    this.aStack_ = [];{string}
                 * @type {string}
     dFill(thaTop = -           * @type {string}
              aTop / he
            MOUSEOUT : 'mou 'mousemove',
            /**
             * 鼠标移到某图形元素之上，事件是：盾形元素
             * @type {string}
             */
            MOUSEOVER : 'mouseover',
            /**
             * 鼠�t} canvasElement The elemenart */
      * 鼠�ring}
             * 'mouseover',
            /**
             *  mer��果没 (attr类璌高nd stys(this pStar         高 (attrnts[8];
    } else {
    ctx.glovar color2 = stops[length - 1 no way t  throwExcepti'mouseover',
            /**
             *             双击事件
             * @type                               // 一次成功元素拖拽的行为事eFloat(s) /  */
            GLOBALOUT : 'glo
             *  // 

            // 一次成功元素拖拽的行为事eFloat(s) / 双击事件
             * @type      */
         > dragover [> dragleave] > drop && cb)) {
                 canvas element so that it can be used as canva vmlStr.push('<div style="overflow: hid();

  // preco.push(o);
    this.mStack_.push(this.m_);
          _��             ' height:', Math.ceil((dh + sy * dh / sh) * scaeturn {Array}
    = function() {
    if (this.aStack_.length) {
      copyState(this.aStack_.pop(), this);
      this.m_ = ths.mStack_.pop();
    }
  };

  funct-2.0
//
// Unless require  defaulrn {
   
                 ' coord  x: Z *is.m_ means how much the area is enlarge   // transformation. So its square root ca Z * W, ',', Z * H, '"',
          DRAGEND : 'dron(req(!(olen = obj.lrdinates.
  function bezireturn;
            }
        ' path="');

    var newSeq = false;
    var min = {x:       , y: null};
    var max       .y + (p.y - this.cuetitionpace��模块 (var i = 0; i < thietition [0,  1,  0],
      [aX, aY, 1]
    ];

    setM(this, matrixMultiply(m1, this.m_), false);
  };

  co(3) + ',' type_  = aType;
    this.x0_ = 0;
    this.y/ Z)rototype.strokeRecetition cb.call(context= 0;
  = 0;
    this.r1_ 143C'lo* @typfunction(aRot) {
   '.s.r0_ = 'false);
      s.currentPath_;
    this.beginPto "FF"
  var d        color: aColor.color,
, c, 0],
      [0,  0, 1]
   ];

    setM(this, mat//Color)ecoducetion: false,

 vecenstM(this, matrixMlo    color: aCol           /**
         * dr i = 有效
         * 0r i = 
    this.lineTo(aX Y, 0],
n(aRot+ aWidth, aY);function(aRot) {
         for (6;
  p.NO_MO志选项�.r0_ =}

    this.srcink: ' elemniti��法 3);
     = 12;
  p.I被NVALIDvar elementStyle =         alpha: aColor.a needed
    if (parts.lengteption('INVAL什么都不干ingC��    devar elementStyle =doNothing形�    'zrende;
    }

isaTypeValid(lType                  tarig');

        /**
   needed
    if (parts.lengt(',');
    // add alpha if neey + "am {*isBhat i[i].indexOf('%') != -hid: '#BetCoords(this, aC
        el.innerHTM(b * 2ng@gma(var k)ity1,';
    }
case 'ideographic'wingugMode === 0)  + m[              return;
               */
        return f       * @author Kene    mediumorchid: '#BetCoords(thisWARRANTIES OR CONDITIONS OF ANY KIND, either exp形元素ied.
// See the License for the speterns o_ctx*
       root     ��容�   var m = [
      [mIND, either expS].toFi图�.toFirent from the canvas one.etitiontHTML('before in �目.toFi3] = 1;
    }
   tion appendFill(ctxguments) {
           which isn't    for (var .
// * Painting mode isn't impleme in a=k in textPrototype. in ager_;
  CanvasRenderingContext2D = Canvaviolelementstyle="position0)
                += 14;
  p.INVALID_ACCESS_ERR = 1ById('wrong-messnerHTML;
        };
        */
    }
);

/**
 * t up externs
  G_vmlCanvasManager ((dw + sx * dw / sw) * scaleX), w.whatwg.org/specs/webuments[ktype)
//   or use Box Sizing Behavio.toFiurn {.toFi  // TODO: use r)
     as_ctxALID         * @memberOfStr, {.push('<gdefault:
  �MOUS�� 3);��存记�rkgray: '#A9A9uments  /**
   harts设�);
    }
teelblu *
 * @desc echa }

  var processSomRs + '       this.repetition_ 'div cyan: '#00FFFF'uments性化定制�化�9ACD32'
  };


  fus]
 * ID_STATE_ERR = 11;
  p.SYNTAX_ERR = 12;
  p.INVALID_MODIFICATION_ERR     * @*/
de = image.height;
 rela    style="position2013 Thomas Fu);
 flowALIDhiddenmay be freely distributed und**
 * echarts�(img) {
    if (!img |ly distributed und纯Javascript� img.tagName != 'IMG') ById('wro imageChild    化�e', onResize);

     _ng@gmnt:'ttp://webfx.eae.numentsas {@cbetweencompiled) code sh     var ang@gmairoid = ua.match(/(Android)function(aRote, aEnd试用
         *({dStroke(thisrt',
     artsTo        uments   }
 ply(m var ipProcess#008B8h--;

    if (6 *'#def各function utes;
        if m22, \d.]+)/);
        vbgt':
        this.repetition_ 。
 * @author firede[fire     omas Fucss  decTotrial and error to'FA',
   : }

  fu;d in:0px;top= ua.      :absolute;width:1pxvar os = th,Name;se 'closource[i{};
        v;';
  };

  contextPrPACE_ERR = 14;
  p.I:_ACC;= 14;
  p.I;tch(/:absolute;width:1px(errorrik@gmail.com)
 atch(/case 'ideograp].join('tch(/TouchPad/);
        var message = s +': DOM Exception 'b 不生成debd/);
        varient = CanvasGradient_;
  CanvasPattern = Canvly distribut(/Web[kK]it[
        va a dummy element so     varD_STATE_ERR = 11;
  p.SYNTAXs([\d_]+)/);
    deepskyblue: '#00BFowExc);
  p.NO_MOaEndaType('_ther ex_a.mat_source[refox\/([\d.]+)/);
  ar and['a.mat Canva.match(/May be freely distribut(/Web[kK]it[a.match(/M// if
eled="', !strovar ie = u��要进行/height should is var ie = ua.m var ie = ua.match(/MSIE ([\d.clean this up with a betterng-message').innerHTML;
        };
        */
    }ern (more) between mulowsers on android
        // - decide if kindle fire in sierrorrik@gmail.com)
 */

define(
    'zrender/to/ Will be iny sued by             break
               metion bind(func,            }
   This is called automaticall首次      �题   var w种dom和c ss = totype.transform = function(m11,:inline-bl     'te    画结束.setWid��调函lightyellow:t = delta / etition       for (vevicegetCoords(thi    'te   decToHex[i * 16 + j] =isY, 0],
(exOf('(', 3);
    varhe alred用
    = mr(d.x / Z) + ',' + mr(d.y /: cp2.ywser hashes

        if ( (ipad) ourrentX_) / 3.0,
 morchid: '#BA55puff: '#FFDAB9',
    peru: '#CD853F',刷�rue, os.versd[2];
        if (iphone && = webo os.ios = os.iphone = true, os.verset();
      ss.owneightAll 强e(dope to ��有     ue, os.version = iphone[2].replace(/_/g,  + m[;
        if (ipad) oALLOWEDAh({type: 'lineTo',te(m[1tweenon () {
    �后ply(mbetw(entY_)
    };
      var beight     s.veetos) os.rid.]+)/);
        vetiti custum ar andutes.height.nodeValue + 'pxxIdentity() ;?[\s\/]+(n [
      [1, 0, 0],
      [0, 1one.  On) browser.silk =unction matrixMultipln targ.NO_MOh(/(iPhone|iPz= 0, len = obj.leng     indle ail.com)
 �元     else if (caleX_ = Math.sqrt(m[0][    else if {string}
             */
               if (config.debugModiphone &&            re to invalid font.
       'texllback content.
        el.inn
        if (webos) os.webos = trne[2].replace(/_/g_pr(iPhone\ p.NO_MODIFICATIfeng@gm  palevioletred: rome)_vmlCanvasM++     // - disc true;
k;oveed) {
       }
        if (attrs..ios)) browser.safarost= true;
        if (webview) browser.webview = true;ol/util
       * @author Ke     �除过期y
// erent from os.kindENDING && ua.match(/Tainfeng@gma_vmlCanvasMa>= 50on:absolute';
   //          iel/) && z8B8B',
    darkgolction that takes t true;
        if    e-6) {
          angl true;te �= mr(d.x / Z) + ',' + mr(dt_(t       os.tablet = !!(ipad ||laybook     if (webvietrue;
        ger_ = {
    inig.debugModeos) os.rim function hueT[0].toFixed(3) + ',' + m[n = (firefox && ua.match( browser.versioumentse, broaType
   usle/)) if (kindle) os.mergeurmentebKit(?!.*Safari)/)vasSupporteZL an (browser.ie && pars     dummy element so each.com)
 /) && owser.pi = true;
     if (kindle) os.kin   *  [];
  for (vacompiled) code sh6];
      dw = argume/))[7];
      dh = arguments[8];
    } elsStartAngle, e/))uncti 1;

      if (fillSC    e     oid/))k = true;
        if seFloat(browsity1,     will douments[8];
    } else {
    upported : !    each: each,
            map:upported : !ar result = createMatrixIdentity();

    fStr.push('<div style="overflow: hidder/config
     * @author Kener (@imagelse {ts
        vlineCap;
    o2.lineJoin          DBLCLICK : 'dbm)
 *        issang (https: = o1.lineWidth;
    o2pported : !  sx = sy =/) &&  };
    /**
 ha = parts[3];
    } els     ],function (ril.com)
         */
        roletred: '#D];
    this.aStack_ = [];
   '       D5', };
    /**
 ];
    this.aStack_ = [];
   + ' has been rialn osunk:Drandle F.one = func} handl 4;
  p        MOUSEOVER : 'mouseover',
           = o1.lineWidth;
    o2.m    ,function (r           canvasSn;
      foReset the cvasM��绑定，dispatch后销毁
    G_vmlCanvasManager;
}); // tful',['require'],function (rol/uti||tos) os.rimtabletos = tru        h : handler,
    || (chrome && ua.matc       this._handlers = {};
   ire'],function (require) {

    /**
     * 事件分发器        require('../dep/        h : handler,
    ified) {
          }

        return {
            inheritsk = true;
        if ext || this
        });

        6) +sang (vigator.uuments[8];
    } else {
    ];
    this.aStack_ = [];{
     ont at startup.
 rn;
            }
us - Z _h[evennt) {
     _h[evenill al   if ed: '#8B0000',
    darender/mixin/Eventful',['require']nctioncatch     Excert rezrender/config',[],function () {try     return fontStyleCache[styleStrh[even  h : handler,
 ource[i+) {
            [];
    this.aStack_ = [];
    var style = el.style;
    var   }).m_), fzrender/config',[],function () {
   t} context
     */
    Eventful.pultiply(m1, t6FA',
    lavenderblush: '#FFF0F5',
  '.push(m1, t of     h[even     ._handlers;

        if (!event) {
       if (bb10)             MOUSEOVER : 'mouseover',
         ��项
     * @exports zrender/config
     * @author Kener (@Kener-林峰, kener.linfeng@gmail.cvent 事件名
     * @param {Function} [handler] 事件处理函数
   T : {
            /**
             * 窗, !!aFill, '"',
    [evenfunction()os: os,
            // 原生canva)
 */
define('zrender/mixin/Eventfulire'],function (require) {

    /**
     * 事件分�   * @type {string}
             */
              */
    var Eventful = function () {
  // 原生canvas支�ted : document.createEle playbook || (ahpuff: '#FFDAB9',
    peru: '#CD853F',
eft = ill do 所lter��: '#32C��['re��lter��rn, '#def  * ��ault#V&& !ua.match(extPrototype.set}ispatch
    royalblue: '#4169E1',
    saddlaTypealmon: '#FA8072',
    ne[2].replace(/_/g * @para;
        if https://www.github.com(/Kindle Fire/)) browser.so an = 0, len = obj.       * @exports zrender/toolner  i <  aile\/峰, kener.linfeng@gmandle Firle\//) &&       var webview = ua.matcndroid/))  browser.c() {

  // alias somei * 16 + j] = ad = ua.mat        owser.version = chrome[1   y: this. trueh(/(Blac switch (argLen) {
rrentY_)
    };
               _h[event] = n = true, browser.version 
    // to find the orinser @param = 0; i ig');
ntful
 * @author Kener      el化
 i < d   * e   swi     ed to制的数._handlers[type];
  Or ex       wssibget .fonclienw), 'p and.call(_ern_(image, repetit       // O      // Todo:apache.org/licenses/LICENSE-2.0
// truen = ie[1];

        os.tablet = !!(ipad         _h[gs = Array.prototyp.call(_h  decToHex[i * 16 + j] =  }
           e && ua.match(/Androi'#DBototype.oneill do       var _h = thial   };dRuntimeHeight;

       if (h > 1)
      h--;

    if (6 Check varis a    idr len = _h.length;
om)
  ire('../config');
                      breumentsof                     }
isEE',
                 if (_h[i]['one']) {
          style.font = this
     ) browser.silk = true, bstyle.font = thisprevch(/Mobil

  // Helper funlue + 'p- return;
    }
y + "'"lements
ill do >   if (!silk && os.fillText = function(t usin   if (silk事�- 1= arguments[8];
    } else {
     DRAGSTART : 'dragstart',
    (!silk && os.a <guments;
        ion processFontStyl= arguments;
     + 1] >     var argLen = args.lengt            GLOBALOUT : 'glo��价最小
    this.textAlign = 'left';
    dient.r0_ = aR0;
 �数是事�i]['ctx'], ar  if (!silk && os.adth) {
    this.drawText_(tex) browser.silk = ightce(en > paramhttps:/         // canvasS�数t':
  �数是事?          UPPOR stroke    vaoords(this, aCP2x, {
    .ntartibling[0].toFixed(3) + ',' switch lementNodiven argBc) {
e]) {
            var        om  if (handler) {
      switch (argLen) {
             aX, aY) {
    var p = getCoorr (@Kener-林峰, kener.lincase 1:
           (/Web[kK]it[
        reak;
                    defai]['ctx'], args);
                           // ha rest���e ted r len = _h.lengne[2].replace(/_/gted uments
           cb,      }

 butes.height.nodeValue + 'px (silk) browser.silk = true, browser.version = silk[1];
        if (!silk && os.android && ua.matchcbhis.cu                   _r.si, iphone || webos  = getCoords(this, aX,                that i         break;
                    de: document.c:
                        // have more than 2 given arguments
                        _h[i]['h'].apply(ctx, args);
                        break;
       (/Kindle Fire/)) browser.silk = true;
        if ng@gmail.com)
         */
        r             }
             iphone || webos init();

  // precompute "00" to "FF"
                  otheKindle Fe     splice(i, 1);
                    len--;
    Oseov     }
                else {
                    i++;
                }
            }
        }

        return this;
    };

    // 对象可以通过 onxxxx 绑定事件
    /**
     * @event module:zrend(chrome) browser.        }
        }
     Function}
     * @default null
     */
    /**
     * @event module:zrender/mixiEventful.prototype.d];
   已x ', h,pe]) {
            var ar break;Len = args.length;

>} [�数是�dden;' +
   if (argLen > 3) {
                arnt:', encodeHt',
    mediumorchid: '#BA55Dtx'], an = ie[1];

        os.tablet = !!(ipad |�，改极端点�.match(/Mobile/))e not implemented.
// * Coord(/Kindle D0',
    up
     *style.font = thisener-�droid = ua.match(/(Androidted : document.cr if (webview) baultwser.version = chroault nul[z.call(ctxKener-�tion (event, handl}
     * @def this.textMeasureEdStr}

    return detect(navigator.userAgent);
});
/**
 * 事件扩展
 * @module zrender/mixin/Eventersion = silk[1];
   ll do f. * 单次触发绑定，dispat(/Kindle Fir }
            
            le:zrender/miowser.version = chrome[1];
   ener-� (ie) browser.iegle = 0;
    ge,
被标记为/ defau webos[2];
    nt module:zrender/mixol/ut事件处理函数
     * @paontinlCanvasManager_.init              }
                      (fewList;
     coral: '#F08080',
    lightcyan: '#E0FFFF',
    lig��LID_MOD��素数量    ��生ggreen: '#00FA9A
     * @event module:zrender/mixin/Eventful#ondragend
     * @etCotype {Functity1,er/mixin/Evenowser.version = chrome[1];
   r cp2 = getCoords(this, aCoke) {
      appendStroke(this, lineStr);
FFDEAD',
    oldStr.p os.itegre���   var m = [
      [mntful#onmousedown
    ress or im>}    rebetwe/ defa50px}'（手指�vent
）x坐标
        * @memb:inline-bloowser.ve] ;
    50px}'后.iphone = true, os.version = iphone[2].replace(/_/g,  + m[to make (X, ',Dy=',    * @pa,rowser.veributes.height.nodeValue + 'px';
 
    relk = true, bro/**
 * 事件扩展
 * @module zrender/mi&& e.zrenunction matrixMultiplewListt;
            }
                          ] ? ipod[3].replreak;
         
        if (webos) os.webos = true, os.version  (attr [1,  0,  0],totype.transform = function(m11, m12, m2;
        var emberOf module:zrender/to: cp1.y,
etition_
     * @default null
     */
    /**
 s

  
         * 2  if (webviegetY(e) {
  , aCP1x, aCP1y);
    v;
        var ipurn typeof e.X;
        }

        /**
        * 提取鼠标y坐标
      清除d.]+)层�/**
    er cloc, os.version = iphone[2].replace(/_/g             // 如果需要�vasSupported : document.createElte �ype 事件类型safari && (ua.match(/Safari/) || !!os.ios)) browser.safa   }

              retuw) browser.webview = true;|| (chrome && ua.This is called automaticall修改鼠标r/mixiingContex   lightyellow:ansform = function(m11,0',
    as {@code this}.
  terns only supp     //l gradr/tool/u�是负值说明滚轮是�[s
      n(requiree.re(https://github.com/pissang)
 */
define(return typeof e.zrenderp;
       d = 'ex_canvas.prototype;
        var nativeFggreen: '#00FF7.zrender          /* j=0.7dden;' +
          /

    thister;

        // 用于处理merge时无法遍历Date等对象的问题
        var BUILTIN_OBJECT = {
    * @memberOf mo
        [FA',
   ]ndert mo
          * @method
         * @param {Evrot目� event�旋�= b = l; // achromati     * @param {Evurce  event�turn oateStyleSheet();
      ss.ownitotype.td = 'ex_obj) {
            return obj && obj.nodeType ();
      ss.owni    }

    e.stopPropagation();
    ,
            '[object if (argLen > 3) {
          moduments
                   s
    _h[i]['h'].apply(_h[          };
        
xt) {
          switch (argLen) {
                    case getX,
            getY :nvasGradi   sx = arguments[1];
      sy = arguments[2];
      sw = argum   y: this.          _h[i]['h'].call(_s
    (_h[i]['ctx']);
                        breas, 1);
            }
            
lt null
     */
    /**
     * @event module:zrend 1:
                        _h[i]['h'].call(_h[i]['ctx']);
             * @type {Function}
     * @default null
     */blet/)eStr.pu) {
            var args = argumentstopPr func的as {@code this}.
if (argLen > 3) {
          droid ||gs = Array.prototype.slice.call(args, 1);
            }
            
            var _h = this._handlers[type];    if (h > 1)
      h--;

    if (6 Savent]0;
  dummy element so     e.cai]['h'].ctx, args[1]);
     /);
    in/Evenut = new  if (handler) {
 window.a ArrayCtwindow.a  if (handler) {
 urce  ArrayCturce {
      appendStroke(thistx);
        
           rost d;
                    case 3:
deine(tor = typeof Float32Array === 'undef  var len = _h.length;
    y:indexOf       ;?[\s\/]+(   for (v,  type="tile"s.webos = true, os.version = webo     ||  != 'undefined' && e.layerY
            skewOffset      encodeHtmlAttribute(text      mergfset = mr(d.x / Z) + e, os.version = rimtabletosfset to mak    if (playbook) br detect(navigator.userAgent);
});
/**
 * 事件扩展
 * @modulfrom ba// Afset =xin/Eve                m[0][1].toFixmerge
         tx'], aicCurv            me     */
    var Eventful = funreturn function () {
     /**fset = mr     || typeof e.offsetY != 'undefined' && e.offsetY
                   || eof e.layerY != 'undefined' && e.layerY
                 = v[1];
                return ou&& ua.matnew ArrayCtor(2);
        // - discern (nt) ;
     | (chrom     || typeof e.offsetY != 'undefined' && e.offsetY
          '#' urn typtotype.transform = function(m11, m12, = {Event} e 事件.
    DE',
  (e) {
          ��.
        */
        functihow getY(e          return typeof e.zrenderY != 'undefined' && e.zrender         urn typeof e.     rsion = ie[1];
 ector2} v1
           ion getY(e) {
  turn typeof e.zview = ua.match(/(iPh* @param {Vectoml_:r webview = ua.match(/(i1[0] + advise from backbone
 
        if (webos) os.webos = true, os.version  [1,  0,os.io != 'undefined' && e.layerY
           ');
       1];
                return out;
    * @param {Vector2} v2   /**
         * �         },

            v1[1] + v2[1];
       * @author Keurn out;
            },

            /**
             * 向�slateg != 'undefined' && e.layerY
           s.versionlue: '#0000CD',
    mediumorchid: '#BA55D1[0] +  (webos) os.webos = true, os.version =��域    v�ggreenefix�is i         out[0] = v[0];
                oar key in source)unction getContext() {
化定�e[firede@fireay be freely distributed unddispla getefine(
    'zrender/tng}
        harts设备环境an: '#00FFFF',
   ��Javascript图表库，�ram {Vector2}         sub: function (ousion
        // - p

  ��没    ��际eet(�，� @paradecToHex[i * 16 + j] = oftwar!        ||    out[!wser = {};
   r2}
             */
      ：被拖拽图形元素
      vas，纯Javasc, y: fontStyle.size})tion detect(ua) {
         = this.os = {};
        v   var browser = this.brows         }
              * @param {Vector2#FFEF ArrayCtor(2 ua.match(/Touch/ ua.match(/(iPhone|iPid]* @para) {
                   * @param {*} [context]
      undefined' &&�回(_h[i]['ctx']);
                   throw newetY != 'undefined' && e.offsetY
              单独     * � fun{
            var args = arguion (event, hanined' && e.layerY
                
             * 创} evenElement: function(endle Fire/)) browser.sbrows  
            var   * @exports zrender/toolid/)) || (chrome && ua.match(/CriOS\/([\owser.version = webkit[1]��         e.pre var vector = {
            /ispo/ * Clipping  v1
             *= true, os.version = ipad[2].replace(/_/g, '.');
        if (ipod) os.ios 
                mes +(idStart++);
    
                mes + 'return function () {
      [\d.]+)/);
        vram {Vecto\d.]+)/);
        var androiit = !!webkit) browser.ver > 3) {
             Dom = v[1];
                return outful#onmouseup
    );
    �递归调用.push({
      type: 'bezierCurv��导� + decToHex[) {
      case 'repea
            return typeof e. 0],
      [m21= el = ]hpwOS)[
      [dx,  dy,-2.0
//
0',
          * �r im64 ur {Vector2} v2
             */
          toDataUR+);
 'right' :       0],
      [m21, argpha;
      lineStmap: map,
{offset: aOffset,
            */
        return f�回调的context
   };

    /**
        cch(/Mobile\//) && !       ar webview = ua.match(/(iP   var(/Web[kK]it[ * s;
               case 3:
      },

            break;
         style.font = this) {
        },

             out[0ut
         n(require) { 0],
      [m21,imeSel = document.creatctor2} v
       ��化
             * @param {Vecttion filter(o&& ua.match(/Tab��序遍历 casoc.na (arrr/mixi鼠标�e retu��vent�z轴|| t�� out[1] = v[1];
           ightext('2e.dispatchWithContdefined' && e.uments[8];
    } else {
    {
            return this;
        }

            out[1t].push(src_ =有_h[event] = [];
        }

      account         fix, �调str ��行幕优化
 或.style.hek: '��续粉刷];
    this.aStack_ = [];
      _h[event].push({
            h : handler,
            one : false,) {
      return fontStyleCache[styl        re    });

        return this;
    };

    /**
     *   * 解绑事件
     * @param {string} e!= handler) {
              resul{Function} [handler] 事件处理函数
     */
    var style = el.style;
    var fon = function (event, handler) {
        var _h = h = this._handlers;

        if (!event) {
  {
            this._handlers = {};
                return this;
        }

        if (handler) {
            if (_h[evh[event]) {
                var newList = t = [];
                for (var i   */
    Eventful.prototype.unbind var style = el.style;
    varKener-林峰, kener.linfeng@gmail.cv2[1]) * (v1[1] - v2[1])
                );
            },

            /**
    T
         */
        EVENT : {
            /**
             * 窗    case 'bottom':
{ = hueT: 'u.heie, bro:ew Er       out[0] =2[0];
                           },

    r2} out
   @param     dy) * 180 / Mat) {
  �回调的context
      return          *       },

            /**
   -2.0
//(cb, context);

     */
    Eventful.prototype.d       * 向�                if (argLen > 3) {
             dFill(th module:zrender/mixin/Eventful#onmouseu 

                   lerp: function (out, v1, v2, t) {
    x), ',',         if (argLen > 3) {
                       module:zrender/mixin/Eventful#onmouseudragover [> drag

        os.tablet = !!(ipad |  // var ay = v1[1];
                ;

  {Vector2} v' + (new Date() - t: fun[0,  v2)         aY0, aX1, aY1) {
 following is      thi.
// YoView�后�mputed we
  2} m  */
            set: f(      aY)l(_h[i]['});

rseIn    l m[0][0]10           one : false,-];
           pad',
 L in b    屏�   this.width_ ��较粗暴 = m[0] * x + m[2] * y + m[4];
            Ren; i+t[0].toFixed(0) -{

        v左乘向量
             * @param           },
            
        am {Vector2} v
             * @param {Vector2} m
             */
            applyTransform: function (out, v, m) {
                var x = v[0];
                var/ you m[1];
               var t[0] = m[0] * x + m[2] * y + m[4];
            Tath_t[1] = m[1] * x + m[3] * y + m[5];
                return out;
            },Bpush({t      /**
             * 求两个向量最小值
                clon 'undefined' && e. {
                o = new ArrayCtor(2);
                        tar      return out;
            },

            /    * 计算向量间距离
             * @param {Vector2} v1
             * @param {   _h[event].push({
            h : handlentY_;
    }

    s�件扩展
 * @module zrndle Fire/))  * @paramsang (https:/ * @event module:zrender/mix[event];
            }
        }
        w, sh;

    // to find t          otype.bind = function (event, handldient.r0_ = aR0;
      tina**
    === 0) {
             rn Math.sqrt(
                    (v1[0] - v2[0]) 解绑事件
     * @param {svent 事件名
  w Er@param {Function} [handler] 事件处理函数dient.r0_ = aR0;
    g = function (event, handler) {
        vt} context
     */
    Eventful.p       od|iPaelse {this;
        }

       vent]) {
                var ne
    o2.textBaseline  = o1.textBaseline;
    o2.scaleX_aram {Vector2} out
                 /**
         * 3x2矩阵操作类
         * @exports zrents: inherits,
           vector.distSquare = vector.distanceSquare;
  @type {string}
             */
           = ie[1];

        os.tablet = !!(ipad |      var iphon      out[ords(this, aCP.scaarts
             *, ISMATCH_ERR');
 1] - v1[1 v2
             */
       �制的数据统计图表�INUSE_A2[0];
             ) {
   tion �后的新对象
  �
             * @param {   out[           result[key] = clone(sourc             retue != 1 || img.tagName != 'IMG')                            }

            SMATCH_ERR');
  (var i in sourcaram {Float32Array|A          return sot
             * @var i in source) te 是否覆盖
        */
            c           */
            copy: function(ouStartAngl];
  for (va             var out = new�标[evenor(2);
                out[0] = x                        out[1] = y || 0;
                 return out;tyle="position:          out};
   if (w0iant + ' ' + styut[5] = m[5];
 this.textMeasureE;
         �相�expaiant + ' ' + sty�从�] = v[0] / d;
          vent 事件名
     * reak;
                    defa G_vmlCanvasManager.initEl00
        },
 插值两个点
    gply(m1,  .getContext('2d')         ctx: cod :tionent. There is no way to,' 0" to="', right ,' 0.05" ',
                 ' coordsize="100 100" coordori      :�
             * @type { {
      appendStram {Float32Array|ArrayasGradienage.height_.push({type: 'lineTo', x:         age.height;
       * 矩阵�;
                out[4

            if (_h[event] && _h;
             at32Array = m1[0] * m2[4] + m1[2] * m2[5] + mat32Array|Am {Float32Array|A  return out;
         ] * m2[5] + m1[5];
                return out;
        = m1[0] * m2[4] + m1[2] * m2[5] + m        out
          @param {Float32Arrayeak;
                    default:
          �标滚轮变化
        * @memberOf modulad && ua.match(/(iPhone\sO             * @param {Vector2} vr} s
             */
            scale: function (out, quire) {
2Array|Array.<number>} m2
       .webklter(obj, cb, conter k in a         ion( {
                     */
        return fm          */
  e]) {
            var 
            },
    (
    'zMISMATCH_ERR');
 ares about the fallback content.
parts.length != 4 || s-2.0
//etition.y + (p.y - this.cu we dpixe@params) {
          ��入子canvas， we dt mo��换也ames��应'#FF��t, a, rad上 (var i = 0; i < thi we d              _ctx = G_v we ddius,
               we d          aStarCirc= p;
          lineStr.push(    va          aStar**
 *ew];
   v2[0]      gFFA',
    misleCa'movst = Math.sin(rad1;
                ad[kK]it[        vak;
        case 'lineTo':
          lineS: 'wa';

    var xStart = aX + mc(aStartAngr(' x= aClockwise ? 'a to docum
      casvar yStart = aY + ms((aStartAngle) *       g2;

   0_ = 0;
    this= a[1].globalAlpha;
 143C'idth @type {number}
   _ = 0;
    this.y1_ = 0;/ Known Issues  [c,  s, 0],
      [-sRR = 6;
 idth有效
         * 0out[5Offset, aColor) {
    aColor = processStyl}

  CanvasGradient_.prototype.addColorStop = function(aOffset, aCon Issuesrototype.addColorStoout;
    number>}on_.prototype = new Error;
  p.IN       E_ERR = 1;
  p.DOMSTRING_SIZE_ERR = 2;
  p.HIERARCHY_REQUEST_ERR = 3;
  p.WRON under the License.


// Known Issues:
//
/_ERR = 6;
 ;
      lipping paths are no * m2[0] ,
                 '" /><veFilter = ArrayProto.fi;
    r || !event)ne(
    'zrender/tool/util'= ArrayProto.manted.
// * Canvas width/height shoul using content-box by default. IE in
//uirks mode will draw the canvas usWARRANTIES OR CONDITIONS OF       out[4] = a[4] * vx;
             aY0;
 '
   tSiz]), 0, 1);
    if (s == 0
     (array[i]��指|Array.    }
有= a[3] 内       */tor
pe to ��g',[ar aa
         */ (arra��标
       �sRender会继承
              * @param {Float32AIND, either express or imr/tool/util',[see  aTye;
    w3.org/TR/2d       /funcpping- false,'../dep/excanvas'],function  [0, 0, 1* @module zrender/to_cK]itr     compiled) codsh('<g_v
       t = aa * ad - ab * acunction() {

  // alias // M peremberOf module:zrender/tool/util
      .round;
  var ms = m.sin;
  v                 && LElement}
 该ert : fu���2];
   t, a, rade : functh(/MSIE ([\d.]+)?/)[
  /**
   * This funtivx;
    we d= Array.prototype.slice;

  /**
CanvasPatter��是并ink: '    ��t} e 二�含 = -ac ��t, a, radntLi     e : funct-2.0
//
ntful#onmousedown
     we d|dule:zrender/tool/event
        out[4] = (ac * aty - ad ;
         ��标图形元素时�tful#onmouseu;
      .sth;
             out[1] = -ab *
    /*Str.p       t mo           sDom(source)
            ideateStyf (this.aStack_.length) {
eturn matrix;
    }
);

/**
 * andler控制模块
 * @module zrendAa.match(/Mob(idwidth = el.cl (@Kener-林峰, kene[idx * @eve                 && ��,
  , a, rad) {hat can bply(module: scale : funct       console.log(arg每次都需要 addHover 所以� ;
        out[4] =: cp2.y d stylice([4] = (ac * aty - ad         Handler
 * @;
   tanceof Array) {;
   n {
r webector2} v1
          urce.length; i < len  var eventTool = Element('quire('./tool/event');
        var util = requir/util');
       mlAttribute(text)');
       ctor2} v2
   ;
    ��逆矩阵
         r-林峰, kenerph : hig.EVENT;

    ;
        va[5] + v[1];
      16 + j] =                          ty1,;
    'click',e not implemented.
// * Coordze', 'click',requToMapmixin/Eve };
        
     l = red to a sci we d to invalid font.
   ');
         renTouments[
            '    // 是否为 dom 对象
                    &&移    m)
 *
 */
// TODO mousen/Eventful'],function (require) {

        

        var config = require('./config');
        var env = r          *./tool/env');
        var eve     *{
              * @retu;
      ,
     ce;
        }

     >=ion:absolute';
   r-林峰, kener.gth;
  970'     */
     entful');

        var d.linfeng@gmail.= [
            '      'mousewheel', 'mousemove', 'mouseout'delFromuseup', '.' + tsedown',
            'touchstart', 'touchend', 'touchmove'
      del;

     h(co var isZRenderElement = function (event) {
            // 暂时忽略 IE8-
  = -ac * det;
        �制模块
 * @module zn(reqrender/Handler
 *  v1
          han 2 given arguments
    ��, kener [
      [1, 0, 0],
      [           /'require','./conaram {Float32Array|target;

            return t - ab * acssName.match(config.elementCla
                retu   'touchstart', 'touchend', 'touchmove'
     /**
             * 窗口大小改变响应函数
      ne;
    o2.scaleX_    = o1.sc  var Eventful = require' ' +
   'moveTo      && !isDom(sou       = -ac * det;
          ce)
         if (ipbent) {
          }ul#ondr true, os   */
            resizted        // 进入�            // have mo source[k     el.s!!       �，globalevent = event || window.event;
                this._lastHover = null;
                this._isMouseDown = 0;renderEvent to invalid font.
           }
      ixin/Eventful');th; i < len; i++) {
         cbmixin/Eventful');��为 dom 对象
                    && ��度

  fu  click: functi孙canvas',['re
                if (! isZRenderElement(event)) {
                    return;
  traver/ * Clipping p            event = this._zrenderEventFixed(event);

                // 分发config.EVENT.CLICK事件
                var _lastHover = this._lastHover;
                if ((_lastHover && _lastHover.clickable)
                    || !_lastHover
                ) {

                    /sedown',
            '      *    param chend', 'touchmove'
       EVENT.C);
             // 是否为 dom 对象
                var env = require('      var isHandler
 * @for debug
        revent = event || window.event;
                this._lastHover = null;
                this._isMouseDown ouseout', 'mouseup', 'mouedown',
            'touchstart', 'touchend', 'touchmove'
        ];

        var isZElement = function (event) {
            // � (ac * aty - ad             * 窗口� = this._zrenderEventFixed(event);

                // 分发config.EVENT.DBLCLICK事件
                var _lastHover = this._lastHover;
     ig.EVENT.RESIZE事件，global
      };

        var domHandlers = {
            /**
             * 窗口大 ) {

                    // 判断没有发生拖拽才触发p1 = getCoords(this, aCP1x, aCP
    var cp2 = getCoords(t.createElement('di (ac * aty - ad0 / 3.0 * (cp.y - this.currentY_)
          mousewheel: function (.x + (p.x - this.currentX_) / 3.-2.0
// we d             uments[layerY仓库��形元素放在目标图uments[ bezierCurveTo(this, cp1, cp2, p);
  };

  contextPrototype.arcerCurvetype {string}
             */
       this.type_  'drop',
 this.x0_ = 0;
    /this.y0_ = 0;type.strokeRecuments[aty;
                this.r1_ = a[1]               }
            }
        }
     @param {Float32Array|Array.<number>}x = a[4];
               kit
             */
    .
// Yo        textA            out[3d.]+):    * @_lastHover &&       },l:Dr:absolute;width         This funtion x;
         eturn outArraym) {are:inl(a, b_h[i]['h'].apply(_h[awill do f= b(https://www.github.com/pis
                    // Very small angl2.0
//a          d  ifb            textPrototype.save = function() {
  ble) {
  z     zon hslToRgb(parts){
    var r, g, b              ��触发绑定�              /**
        this._zrend (M;
    }

  type = new Error;
  p.IN         e);
  };

  contextPrototype.tranhe canvas one.                   v1
             *ount= -ac ��规erli��，idR');
  ��ma / 3.0 * (cp.x      nt_;
  droid = ua.match(/(An  var saf|| t        this�t. Til',ype;
增删         #70809也是[1] 方向espa��前[0] = 在下�s',['require']
      );
 tition_ke (compiled) code sh      2} mmouseX - pos[0]) * (scale -&& e.zren                        pos[1] -= (tch (e) {

        v           /**
                  迭代 {
            return {number} 鼠标（手�fun        iphone = tr，hrow new Er终止          [dx,  dy,  1]
    ];

  [,
    ]        12, m21,缺省为仅降         普逐��   case 'left':
  le = true;
       ,
    icCurv=w Erx_canvas是       layroll action 
            typeof e.  event= hueT=,

 event);
   default scroll c;
      时ent);
 Str.pu��[1] x, urnaction 
                        evente, brodefined' && e.w��       ��    */
     ）x坐标
       1] - v1[1]);
        uments[he <canvas>      els          idefuntPath_;
                  tarhis._mousemoveHandler(         o    dsRefresh = false;


            if (_h[event] && _h  eventTool.his._handlers[type];
         la数leY_       dy = arguments[6];
      dw = argume      pos[0] -= (m[7];
      dh = arguments[8];
    } else {
@defauowser = {}pos[0] -= (munction matrixMultiply(m1elue, browser.version = ie[1];*/
    /**
     fun(el            else {
   : null;
        if (webos) o   return {
            inherits: inherits,
��动响应函数
        e, bror2}
             */
     e, bro[2];
     reak;
                    defaERR =             |},

 yle="position:absolut           if to invalid font.
    }
       
      weight: style.f  * nt browser espa��der/
  fut + ' ' + style.weight + '.push('<g_'undefined' && eze="100 100" coordorighile (l--/ d;
                }
         )) {    pos[1] -= ([l]                   return;
  ;
                }

                ) != -1) {
      computedStyle.size = fontSize / .75;
    } else {
    m_;
Copyruht 2006 Google Inc.
.
// You may obtain a copy of
                 底mouseX - this._lastX;
                    mousemove: fun = this._mouseY -.offsetX
                   || g.EVENT.DRAGSTART事件
        i       // 避免手抖点击误认为拖拽
                // if (this._mouseX - this._lastX > 1 || this._mouseY - this._lastY > 1) {             * 向量乘法
             * @param {Vector2} outink: '     || t mo     turn out;
  this._clickThre   ss.owni�config.EVENT.MOUSEWHEEL�k: '#
        endering2];
                      }
        };

        r;

/**
 * Handler�this._lastHover, EVENT.MOUSEWHEEL�一个向量
          ideis._lastX = this._mous// var mConnrts = getRgbHslC&& ua.mat0] -= (mouseX -0;
                this._event = eventction (event) {
                if (! isZRenderElemection (event) ('./m                    re    dy = arguments[2];
tari]['{
                    reicCurv       �，global
               th
                return obj.fon(out, a, v) ontextPrototy   this.s   thied to a scientif ?lement
 : [ement
= 0, len = obj.length;  using cojdw = a        th         j < k; jterateAndFindHover();

       tAngle, ��元�[j]    r cursor[j]se from getarHover[j= null;
            loat32Array|Array.<number>} m1
                   }

               s - Z2;

[event][i]);
                    }
                }
                     out[3] = m1[1] * ction (event) sort_dragghBuildinLay((_lastHover && _lais._lastX = this._mouseX;
 typeof e.offsetX !=ction (event) {
                if (! isZRenderElement(ee.delHover();
                   if (this.painter.is._draggingTarget);

        ble) {
             和dragLeave
                    if (!this.       enderingContex队列
            return (this._lastHover && this._lastHover != this._drag该                  详见{@linkKIND, either express or imhe <canvas>           thisr/tool/util',[    ) {
                        // 可能出现config.EVENT.MOUSEOUT事件
         [2];
        this._processOutShape(event);

            this._clickThresho                this._lastY = this._moor2} v1
             * @p = this._tful');

        /**
        * 提取�_draggingTarge            'g_vml_', 'urn:(https轮是前      
�距�c;
  �    dern, ����click事件
     ��lers� cen             we d和ply(mrget)
   ��量�把       t = m的ply(m保    ��       ��oc.namespaces.art =�� pStarpace(doc,

  funct（�
     */z > ion(oux, urn) �排序得                if (layer._lastHover, EVENT.MOUSEWHEEL           thisut
             * @param {Vector2} - 1);
                       ht.nodeValue + 'px';
     cale - 1);
ild.style.height = el.clientHeight + 'px';
  Vector2} v
 - 1);
unction matrixMultipls支持，�AndA* aRadiu       handlers[type];
            var  = this._mouseY t = event;

      tch (eder/mixin/Eventful#ondragenter
  cursor;

 ;

                thisht = el.clientHeight + 'px' // 找到的在�             = i      case 3:
                      = this._m 拖拽不触发click事件
    x;
         , EVENT.MOUSEWHEEL._lastHover, EVENT          ide;
   ns to make not implemented.
// * Coord,['reqototypeumber} [y=0]
             * @return {VectoF4F',
    darks                  case 2:
                 mouseohis._handlers[type];
        var rget)
    det�� varparam          ndragend
     * @tyt = this._Element('c��发绑定，dispatlatedTarget;
                 case 2:
           one/) && u 0],
��on add，global
              mouseout: function (evelineJoin      = o    
    return.linfeng@gmai包含在root中的dom引�      ent = this._z#DCDCDC',
    ghostw    gold: '#FFD700',
    goons to make (clatedTarget; '#87CEFA',
    lightslategray: '#778899',
    l       nderEleent(event)) {
                }
  }

  function createMatrixIdentelevent;
                this._lastHoverastHover = null;
           }

 Eventful
 * @author Ke(/PhoneForce    markull:ol/utiifent = ei   this= o1.lineWidth;
    o2lick',unction()    unctiondigo        this�轮变化，事件对象是._lastHover, EVENT.;

       mouseout        * @param {*} [context]
              nt = ee: fn he        (thiement != t;
            }

            arentNode;
      4F4F',
    darkslategrey: '#2F4F4F',
!this的dom引起的mouseOutcase 2:
                ��
                      }
     ++;
  ��发绑定，diunction}
     * @default null
     */化，    */
his._zodule:组ewheel Math.max(
  
            return typeof matrix;
    }
);

/**
 *  matrix;
    }
) we do �滚动
        */
        fun[ternss tha�上滚动，�_lastHover, EVENT.MOUSEWHEELmo           res      if (  decToHex[Math.floor(b *     ativeFilter) {
                ret)) {
      layer.__[              outction that takes t2) {
 Hover();
           t;
        ，global
                 }

             ��开，MOUSEOUT�第二    sZRen直接_';
  vent]) {
                va//    ent, ��发con,      }
      三aram ML v会-ac ��环;
                  // 仅作�主�// Pr��向 1.x 版
   ���d) {2useDownMo['re��议_';
  s._mouseDownTar} event 事件名
     *   if (Element([1];
     'click',    this._is    }
     �，事件对象是：目标图�r root el      }
            kThreshold++;
    Z / in       }

             (this._handlers[type]) {
            var args_mouseX;
r.web    cument.or2} out
             * @param {Vner.DOWN, eve��发con               this._lastDownButton = event.butt    }
                    this._lastDownBzrender/config',[],function () {
   ondrop
     * @type {Function}  * 求负向量
             * @paramnt);
      hasOwn bre;
  ( eve      // 避免手抖点击误认r for root[ eve;
  this._turn;
function (out, v) {
                out[0] = -v[0];
                out[1] = -sZRenderElement; i <   th(_h[i]['ctx']);
         �形元素或空
             * @type {string}
          oot.style.cursothis._efault';
                this._isMouseDown = 0;htslategray: '#778899',
    lightsla��法
             * @param {Vector2} out71',
 鼠标（手指�应函数
             cur  mediumslateblue: '#7B680',
         Id        ht ston}
�attrs.width.nodeValueEE',
    m: '#00FA9A',
    mediumturquoigency(this._lastHover, EVENT.MOUSEWHEELidnightblue: '#191);
    , 970',
    mintcream: 'StartAngle, ckThreshold = 0);
    aram {Float32Array|Array.<number>} m1
            r result = cr    var Eventful = requir      ret
   * @param    horizontam, updateLineScale) {
    d: this.textMeasureEl_.oarguments[4];
      sx = sy   // eventTool.stop( {
 ic/ 阻止浏览器默认事�reEl_ = this.element_.lts: inherits,
                 idnigh// 一次f              // 仅作� * 计算向量间距离
             * @param {Vector2} v1
gTarget.modSelf();
     _h[event]idnigh{
          idnig1970',
 ed: '#8B0000',
   owser.version = chrome[1entFixed Touch移�'#87CEFA',
    lightslategray: '#778899',
    lightsla��法
             * @param {Vector2} out
nt',' @param {Event}ineScale_;
  }

  var colorData = {
    aliceblue: '#F0F8nt);
  gency(this._lastHover, EVENT.MOUSEWHEELed(3) +  @param  {Vector2} v2
            entFixe, broN result = cr * @param {number} a
   this._proceshis._draggingTarget.modSef e.offsetY != 'undefined' && e.offsetY
           空lement(event)) {
                     * @param {Event}     retut
             * @param {Vector2} �出现config.EVENT.DRAGLEAVE事 set: function (out, a, b) {
                out[0t);
         �     ss.c��.namespaces.a: cp1.y,
      cp2x: cp2.x,
      cp2y, EVENT.MOUSEWHEELhas�个向量     },
            
            /**
      tion (event) {
    leme (event) {
                if (! isZRenderEis._processDrop(event);
     ._la��canvas',['requir0DD',
    powderblue: '#B0E0E6'ply(m          mousedown: function (eventis._zrenderEventFixed(event, tr化定�rn;
        tShape(event);

   tition_   var _h adde || !event) {
16 + j] = shold = 0;
.id      scale: function (out,

            if (_h[event] && _heltouchstart', 'touchend', 'touchmove'
el   ];

        var isZRend       case 3:
                    , 'mouseu = vector.distancor;

       his.roo    */
            copy: function (out, * 二维� this._processDrop(event);
                * @param {Event} break;correc {EvelId]USEOUT�_ERR��
               Math.min(layer,

            /**
               if (now - this._I      var eveonfig.debugMode    th {
            browser: browser,
      �r.refr    
       }
  }

  function createMatrixIdentity()                [1, 0, 0],
      [0, 1, 0],
  ��
                this._dispatchAgency        iin ahis.dispatch(EVENT.RESIZE, event);
     ById('wro            * 窗口大小�ction (event, handler, context) {
        var _h = this._hanoom / layer.__zoom;
  (v) {
                出现config.EVENT.DRAGLEAVE事* (scale - 1);
       ver();
                }
      ndler.call(context, e);
            };            sZRenderElement(event)) {
                    returnent);
I'touchstart',entific notation string.
 typeof e.offsetX !=              this._iterateAndFindHover();

   & (andro化�     r = null;
            zoom || 1;
             2Array|Array.<number>} m2
       ��发绑定，dioment = now;
        eshold
                this._clickThreshold = 0;
 if (! isZRenderEthis.painter.refreshHover();
                 ) {
                out[0] = v[0]    var target = event.to 1);
,  = vector.distanc       || event.relatedTargeod && (androh(configleFin;

    // to find the or      *             || event.srndler(event);
                    if (now - this._ls._last} context 运行时this环境
         * @retuy.<number>} Vector2
         */
    rEventFixed(event, trmousef (now - this._lastTouchMoment ent);
                    if (now - this._last
                 }

        4F4F',
    darks            this._lastDow     this._mobileFind        '.') : null;
        if (webos) os.webos = trSEOUT事件
                          this._lastClickMtful#onmouseu         * 为控制类�* @param {module:zrender/StoraomHandler(                 this._lastClickMvent)) {
               * 为控制类实�stDownButthis._processDragSt      * @pa         * 为�ender/tool/event',['reqndler 要bind的function
         * @parar
         * @         }
                 */
            touchmove: function (event) {
                if (! isZRe     ��量� * 向�
                        }
                   } out
             * @param {Vectoroom / layer.__zoo pos[0]) * (scale -      between pos[0]) * (scale - 1);
                      pos[0] -= (mousit = !!webkit) browser.verble) {
uments[.y + (p.y -  touch end - start < anim目�/easr) {,[ [c,  s, 0]'./tool/evenUP, event);
    ��,
  ��码来自     OM/DOM_event_resole/tween.js/blob/mast    rc/Toment;
 var ab = a[1];
        eDow this.x0ionMoment;
  = funcs/03_     s.htms;
           ex              is._isMouseDown rent from the canvas one.eDown             out[3ldenrosText = 'canvr/tool/guid',[],functio         * Toucrds(this, aCPx, (! isZRend* Example:
   *
 nting mode isn't imLineamousayer.minZsource[key];
        ble) {
   // 过滤首�il((dw + sx * dw/ 二tps:�  re= fals（t^2�String;
    } Hover = bind3Arg(findHover, this);
            this._domHover = painter.getDomHover();
          Q        InDomHandler(this);

            // 初始� *�化，事件绑定�件计算得来
            if (window.addEventListener) {
                window.addEventListener('resize', this._reOu /**
      ;
                
               (2 - ntX;
        }

let || env.os.phone) {
                    // mobile支持
                    root.addEventListener('touchstart', this._IntouchstartHandler);
                dlersky2 =2
   e-6) {
          angle = ble) {
0.5        if (env.os.tabturn function (arg1, arg2, a -�模�(--t.addkthis     type="tile"',
 定，支持的所朸���件都由如下原3��事件计算得来
            if (window.addEventListener) {
                window.addEventListener('resize',CubresizeHandler);
                
                    if (env.os.tablet || env.os.phone) {
                    // mobile支持
                    root.addEventListener('touchstart     touchstartHandler);
                    roos._cli      +  return;
    }
                    root.addEventListener('mousedown', this._mousedownHandler);
                    root.addEventList     }
                else {
                    // mobile的click/move/up/down自己模拟
   
                    root.addEventListener('clik', thickHa    /        }    // Close the 定，支持的所�四��件都由如下原4��事件计算得来
            if (window.addEventListener) {
                window.addEventListener('resize', th         root.addEventListener('mousemove', this._mouse    if (env.os.tablet || env.os.phone) {
                    // mobile支持
                    root.addEventListener('touchstart',     touchstartHandler);
                    roo1 -his._cliwn', thisListener('touchmove', this._touchmoveHandler);
                    root.addEventListener('touchend', this._touchendHandler);
     .attachis._mouseoutHandler);
            }
            else {
                window.attachEvent('onresi
                    root.addEventListener('click', thittachEvent('oncli��etandl��，事件绑定，支持的所有���件都由如下原5��事件计算得来
            if (window.addEventListener) {
                window.addEventListener('resize', tinattachEvent('onmousewheel', this._mouseeturn k *opyright 2006 ;
  Inc.
//
//},e Inc.
//
// /**e Inc.
//
//  * @param {number} k Apache License, r
// Con 2.0 (t Apache License/e Inc.
//
// QuinticOut: function (k) { Apache Licens   ou may --pyright 2006 Goog + 1le Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with Inthe License.
// You may obtain a copif ((k *= 2) < 1You may obtain a cop copy of th0.5icense at
//
//  oogle Inc.
//
// 
// L may obtain a copy of thS OF AS" B-SIS,
cense at
//
//   h2)le Inc.
//
// Liccensed under t/ 正弦曲线的缓动（sin(t)）censed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliancSinusoidalIn License.
// You may obtain a copy of th1 - Math.cos" BAths arPI /rmissions and
// lim// * Patterns only support repeat.
// * Radial gradient are not implemented. The VML version of these look very
//   dithe License.
// You may obtain a copy of thhs arssuet implemented.
// * Coordsize. The width and height attribute have higher priority than the
//   width and height style values which isn't correct.
// *er the License is distributed on an "Ae for the spec paths are noplemente* k)issions and
// limitations under th��数ense.


// Known I2^t
//
// * Patterns only support repeat.
// * Radial gradient are not implemented. The VML version of these look veExponentidifferent from the canvas one.
// * Clippingk === 0 ? 0 :vas wipow(1024, k - 1// * Coordsize. The width and height attribute have higher priority than the
//   width and height style values which isn't cors always rothe License.
// You may obtain a copy of thr.linf1 ? 1 :g paths ar
def2, -10 or u/dep/excanvas',['require'],function(require) {
    
// Only add this code if we do not already have a canvas implementation
if (!documenter the License is distributed on an "AS ISr.linfeWITHOUT WARRANTIES OR CONDITIONSxpress or implied.
// See the Licensl precisio WITHOUT WARRANTIES OR CONDITIONttp://www.apachSION = +navigator.userAgen" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF Al.com
define('zrender/dep/excanvas'ied.
// See the License for the spec-lias some functionific 1))permissions and
// limitations under t圆形ense.


// Known Isqrt(1-t^2:
//
// * Patterns only support repeat.
// * Radial gradient are not implemented. The VML version of these look veCircularfferent from the canvas one.
// * Clipping paths arontext -ther e to make (compiled) code shorter
  var m = Math;
  var mr = m.round;
  var ms = m.sin;
  var mc = m.cos;
  var abs = m.abs;
  v will al Painting mode isn't implemented.
// * Canvas widis}.
   (e Licenuse Box Sizing Beha);
  }

  var slice = Array.prototype.slice;

  /**
   * Binds a function to an object. The returned function will alwa the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITION-he specode this}.
   *
   * * @return {CanvasRenderingContext2D_}
   */
  functionct} obj The objfic languag thier/dep/excanvas',['   (this.context_��建类似于弹簧在停止前来回振荡的动画'require'],function(require) {
    
// Only add this code if we do not already have a canvas implementation
if lasunder License.
// You may obtain a copvar s; , urn) {
    if (!doca = 0.  * This funtion is!docp    d4eturn {CanvasRendel precision
  var Z = 10;
  var Z2 = Z / 2;

  var IE_VERSION = +navigator.userAgent.match(/MSIE ([\d.]+)?/)[1];

  /**
   * This funtion is assigned to the <canv!a || a
// WITHOUT WARRANTIES OR CO    1; s = p / , '#default#VML');

// See the LicenselseITHOUT WARRANTIES OR COSetup s {HTMLassue1 / a) / (2 implementreturn {CanvasRenderingContext2D_}
   */
  f-(ais {HTMLElem2, {
    rettch() e Apache Licensanvas{display:ias width/ retusngua
      var ss / pt should act as this when the function
   *     is called
   * @param {*} var_args Rest arguments that will be used as the initi addNamthe License.
// You may obtain a cop!doc.nmespaces[prefix]) {
      doc.namespaces.add(prefix, urn, '#default#VML');
    }
  }

  function addNamespacesAndStylesheet(doc) {
    addNamespace(doc, 'g_vml_', 'urn:schemas-microsoft-com:vml');
    addNamespace(doc, 'g_o_', 'urn:schemas-microsoft-com:office:office');

    // Setup default CSS.  Only add one style sheet per document
    if (!doc.styleSheets['ex_canvas_']) {
      var ss = doc.createStyleSheet();
      ss.owningEement.id = 'ex_canctions ss.cssText = 'canvas{displaline-block;overflow:hidden;' +
      ction() {
      returne is 300x150 in Gecko and Opera
          'text-align:left;width:300px;height:150px}';
    }
  }

  // Add namespace    arguments when the function is calmespacesAndStylesheet(document);

  var G_vmlCanvasManager_ = {
    init: function(opt_doc) {
      var doc = opt_doc || document;
      // Create a dummy element so that IE will allow canvas elements to be
      // recognized.
      doc.createElement('canvas');
      doc.attachEvent('onreadystatechange', bind(this.init_, this, doc));
    },

    init_: function(doc) {
      // find all canvas elements
      var els = doc.getElemled
   * @return {Function} A new function that has boument.id = 'ex_canvas_';
      HOUT WARRANTIES OR COcense,line-block;overflow:hidden;' +
          // default y add one style sheet ou may gName('canvas');
     lback content. There is no way to hide text nodes so we
        // just r *the s httpontext_ ||
        (this.context_ �某一nction开始沿指示的路径进行tion be��理前�chEv收回该nction

//��动,

    /**
     * Public initializes a canvas element so that it can be used as canvas
     * element from nowBackespace(doc, prefix, urn) {
    if (!doc.   /.70158cesAndStylesheet(d {

(funcright ((sctioncoordverfle Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliancattr is called automatically before the page       // TODO: use runtimeStyle ande License ze
          +erfl http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distribuattrs.   el.width = el.clientWidth;
        }
        if  * 1.525 '#default#VML');
    " BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF A/heigrdsize
          // ereturn {CanvasRenderingContext2D_}
   */
  functionific language gfied) {
          //s.context_ ||
        (this.context_oncat弹跳效果eStyle and coordsize
          // el.getContext().setHeight_(attrs.height.nodeValue);
          el.style.heightouncefferent from the canvas one.
// * Clipping patex_cag.is doeOu}.
   *el.getContext().setWidth_(attrs.width.nodeValue);
          el.style.width = attrs.width.nodeValue + 'px';
        } else {
    dth =  e;

  // this is used for sub pixel prec<ork// 2.75)WITHOUT WARRANTIES OR CONDITION7.562OF ANY KIault CSS.  Only add one style sheet per dtChild.st2le.height = el.clientHeight + 'px';
        brea   ret(1.5le.height //   h0.7.height = el.clientn onResize(e) {
    var el = e.srtyle.width =    if (el.firstChild) {
      el.firstChild.2.2yle.width =  el.cli93entWidth + 'px';
      el.firstChild.style.ht + 'px';
    }
  }

  G_vmlCanvasManager_.ini  br;

  // precompute84 "00" to "FF"
  var decToHex = [];

        break;
      case 'height':
        el.getContext().clearRect();
        el.style.height = el.attributes.heig.sqrt;

  // this is used for sub pixel prec<the ight + 'px';
    }
  }

  G_vmlstyle.width =Ih/heigangua0.ntWidth + 'px';
      el.firstChild.sreateMatrixIdentity(  el
    eturnel.innerH(var x = 0; x < 3
// See th}ML = '';

 reateMatrixIdcesAnd}
);


the A* nction主控制器m2[z@config targetz][y];
对象，可以是数组  }
��果
    retul le��会批量分发onframe等事件       resullife(1000)z][y];
时长       resuldelay(llStyle;
延迟    ��illStyle     oop(true)       resulgapo1.li��环的间隔o2.lineJoin      =, o2) {       resulstyle.(opse.
aloin;
    o2.londestroy;
    o2.shadowBlur    =restart;
    o2.shad/
define(,

  'zrender/animase.
/Clip',['require','./style.'],icense.
(tX;
   ight,

    /*!docEtyle. = tX;
   (2.shadowOfx][zanvas{diicense.
/dowO;
    osffsetY;
    o o2.this._t[x][yPool = o1.glob.t[x][y]|| {}cesAndStyleshechema(ont          = o1instanceof Arrayeight + 'px';
    }
 ont          = o1.f[eX_    = o1.scaleX]       for (var itations under t生命周期pha;
    o2.font    = o1.font;
   olorD|| .filcesAndStylesheext_��时pha;
    o2.font      = 1.font;
      aqu||2;

  var IE_VERext_cause 2.lineJ   o2.scaleX_    r   =TimrDatnew Date().geue: '(  //D7',
    aq;ext_��位毫秒  o2.lineScale_   ��� o2.lineJ   o2.scaleX_    ende: '#FF,
    bisque: '#00000',
olorD*blue: 'itations under th��否h     A2BE2',
    brown: o1.A',
yp o1.a = {
   choco= 'un;
    d'tent. There is no way to ? faer d:#D2691E',
   tblue: '#5F9EA0ont  gaocolont;
   mson4',
  A2BE2',
    brown:style.n: '#DC143Cdarkblu|| 'Linear'yan: '#00FFFF',
    , o2) {n: '#DC143C, o2) {cesAndStyleshedarkgol o1.shad: '#B8860B', o1.shadarkgray: '#A9A9A9',
lor   =d: '#B8860B',lor   =cesAndStyl   o2.lineSdowO.protoate: =ar i = 0; i < 1step  License.
//timOffsenamespaces.add(prefixercen darkoran -,
    burlywood:    DEB887',
 yan: '#00FFFF', '#F0FF还没FF',
  of the element.
    rchid: '<on
  var Z = 10;
  var Z2 = Z / tWidth + 'px';
      '#FF8C00',
    drchid: '#9hs armin darksla,ion() '#FF8C00',
    darkostyle.Funccolate: '#
    darkblue= 'strowOftent. There is no way to erblue: '#6rokeSt[
    darkbl]epskyblue: '#00BFFF',
    dimgray::ppink: '#FF1cesAndStylesheet(documschedul2A',
te: '# '#9400D3',
93',icense.
eepskyblue: '#00BFFF',?#FFFAF0',
  darkslantent. There is no way:2F4F4F',0CED1',
    darkvioont  f o1.so2) {',    flora00CED1',
    darkvioblueviolereen: '#8FBC8F',
    darkslatatch(/MSIE ([\d.]+)?/)[1];

S IS,
    choight + 'px';
    }
  }

   goldenlor   = emove all childNode',
    gree重新FF',
 .lineScale_;
  }

 tations under th��出而不是直接调用  o2.f直到 stage.update 后再统一',
   这些  o2.filightblue: '#ADD8E6',
  ou may 'lor   ='    ivory: '#FFFFF0',

// See the Licensightlightblue: '#ADD8E6',ext_neCap;��成将FFAC��     }

 标识为待删除oldenrodyellow: '#FAFAD2'��A = o1.sh00',
  中mory
 copyStat '#D3D3D3',
    lightpinkont   needsRemov2A',
ru darkgray: '#A9E6',
    lightco o1.shaF08080',
    lightc
// See the Licens) {
      for (var y = 0nullle Inc.
//
// Licensed under ',
    d License.
(atically before the page32CC'FFE4C4',
    black: '#cesAndStylesheet(documremaiffse'#9932CC',
    darkred: '#8B%000',
    darhtseagreen: '#20B2AA',bisque: '#FFE4C4',
    black: '#0-ine: '#66CD00000',gak: '#FFF8DC',
  '#20B2AA',
    lightskyb495EDle Inc.
//
// Licensed under rod:imegreen: '#eventType, argight + 'px';
    }
 for (!doci    , lenA',
    b       = o.length; i <idni; i++FF0',
    hotpink: '#FF69B4',
  ['on' +  '#48D1CC]ianred: '#CD5C5C',
    indigo: '    moccasin: '#FFn;
    o2.textBas[i]',
   08080',
    lightcyan: '#E0FFFF',
    liString(16) + j.toString(16);
constructor:#8B00 z = 0; z < 3; z++) {
      dowOm += m1[x][z * m2[z][y];
   类, 调度和管理所有tyle;
     }

          moloralowOffsetX = o1.shaB6C1',
       author pissang(https://github.com/FDAB9',wColor;
    o2.shadowOffsetX = o1.shaB6C1',
  ffsetX;
    o2.sdowOff'../tool/color  rosybrownutil  rosybrown '#48ffsetY = o1.shadowOffse78899',
    lightetY;
    o2.stdowOyle   = o1.strdowOf#6B8E23',
 !doc: '#Byle   = o1.stsybrown: '#BC0',
    seagree roy2E8B57',
    seashel roya0',
    seagreeDispatch6CDAAB57',
    seashel169E1').slateblue:0CED1',
   marinequestB6C1',
  Fenrod: window.'#708090',
    snow: epskyblue: '#00BFFF',
    dimgray:    daFFAFA',msR    springgreen: '#00FF7F',
    steelblue: '#4682B4',
    tan: '#D2Boz8C',
    thistle: '#D8BFD8',
    tomato: '#FF6347',
    turquoise: 'webkit8C',
    thistle: '#D8BFD8',
    tomato: '#FF6347',
    turquicense.
//icenianred: '#CD5C5C',
    indigt
    if (!doc.stlack: outleStr, 16#6B8E23',
    orange: 'FA500',
    orang    slategrey: aextBSlic6',
textB8B',
    d.sStri0CED1',
   the Apache Li* @ite:def {Object} IZROffseS7CFC);
    // addproperty {0D3'se.
} 0',
  );
    // at in compld).split(','
    lightshpuflias 
    p:payawhip: '#FFEFD5',
    peac   return p '#DA70D6',.length != 4 |ersion needed
[o1.globrey: '#6969e, Versionring.charAmin, maxB',
    ) {
    return Math.m    if (partsMath.max(mi#7CFC) {
    returnexampls.length != 4 parts =  = o1.sh',
    B6C1',
  0FF',
    medrts[0]) / objarkolivegreen:rts[0]0, 1x:blue},

    /**1]), 0, 1)y
     = clamp(percentgn     = o1.rts[0]360 % 360.360 % e(node.posise.
ntent. Ther1]), 0, 1).when1.fil,rcent(parts[1]), 0, 1), 1);
 5  l = clamp(percent(par(parts[5]), 0, 1);
    if  if ( } else {
      var q = l <20.5 ? l * (1 + s) : l + s - l * s   l = clamp(percent(par(parts[2]), 0, 1);
    if , h + 1 / 3);
      g = huer   = 'spline '#87CEEB',
      parts[!docB6C1',
     mcense.
//o1.globalAlpha;
    o2.fo1.globn: '#DC143xtAlign A2BE2',
    brown:#7CFCn: '#DC143C h++;
h) {
    if (h < 0)
     oldenrod: '#B8860B',
    slContent(st#32C
    if (h < 0)
// priv
   || styliesA2BE2',
    brown: clipRgb([]    if (h < 0)
     _runnkblue:mediumspha;
    o2.font    : '#FFcyan: '#00FFFF',slateblue:.call',
  #6B8E23',
 
    if (h <B6C1',
   B',
    darkolivegreen: '#the Apache License,添加rtychan��段 Apache License, Version  }

  function percent(sdowO}  * hthis file except in compliancaddmegreen: '# * hseline;
    o2.scaleX_     * h .pushleStrile Inc.
//
// Licensed under the Apache License,A',
  ache) {
      return processStyleCache[styleString];
    }

    var str, alpha = 1;

    styleStringrightsString(styleString);
    if (styleS85',
dx =enna:.'#66xOfn;
     * h ,r str#6B8E23',
    orangS ISi].i>ion
  var Z = 10;
  var Z2 tring.charAtex[Mcepart '#00CFA500',
    orangered: '#FF4500',
    orchid:_0',
  megreen: '#32CDD32',
    linen: '#FAF0E6',
    magenta: '#FF00FF',
    mediumaquamaridelt    32CC',
    da    cesAndStylesheet(docum * h < 2-1) {
     cesAndStylesheet(documdnightcharAt    minalpha = +parts[3];
   deferredE'#48 < 2)
     str = colorData[styleStridowO| styleString;
    }
   #C71585',
    ntcream: '#F5FFFA',
    mistyrose: '#F   str =;
    } [ileString;
    }
   kviolet: ;
    }.556Bkorangormal',
    variant: '// Throw out thecasin:s 
    to be Styled afte00;
  }

  FFF0',
    kha#7CFC00',
  , like  o1.sha',
    hotpink: '#FF69B4'nge: '#FF8C00',
    dssFontSttyleString] ||t(0) ='normal',
    size: 12, tStyle(styleessStt(0) == '#') {
      str range: '#FFA500',
    orange '#808080',
    greelightsk0
  finishedr str, alpha = 1;

] = {color: str, alpha: alpFF0',
    hotpink: '#FF69B4'tyle: 'n',
    lightsianred: '#CD5C5C',
    indigtyle: 'n  style: dnig- 1normal',
    variant: 'y.split('.pop,
    ivory: '#FFFFF0',
    len--08080',
    lightcyan: '#E0FFFF',
    lightgper document
    if (!doc.sercen++ntStyleCache[styleString];
    }

    var el = document.crednightle(styleString)lse {
  e[styleString] = {color: str, alpha: alpha};
  }

  var DEFAULT_STYLring]) {
    ringrod: tyleString] ||[i];
        }
        sumorchid: '#BA55D3',
       retent(sumorchid: '#BA55D3',
 , o2) {( part00CED1',
    darkvioont  dlateblu '#DAA520' {
    var computedStyle 9B4',
   #7CFC00',
   * 255);
        } else {
   #7CFC00',
  0FF',
    mediumaquaString(16) + j.toString(16);
    }
  }

  functiFF',
 运y
       this file except in compliancr   = License.
//atically before the page elfhslToRggetComputedStyle(style, 2 - m1) * (lue: 'tyle.fontWeight ||cense.
/weighFF0',
    hotpink: '#FF69B4'dStyse if (stianred: '#CD5C5C',
    indiglightblue: '#ADD8E6',
    l708090',
    snow: (556B00CED1',
    darkviondexOf('('   }var canvasFontSize = parseString];
    }

    var el = document.cre
  }

  funct    magenta: '#FF00FF',
    mediumaquayle.size = canvasFontSize * foat(element.currentStyle.fontSize),
        fonts))) = parseFloat(style.size);

    if (typeof ople.size == 'number') {
      com + (m2 - m1) * (2 / 3 - Inc.
//
// Licensed under the Apache License,清除
    palevio{
      return procest in compliancclear2F',
    darking);
    if (styleString.charA styleString;
    }currentStyle.fontSize),
        fon��一个目标width' + ' '360 % or;
      }
    }
��定 + sty中 fun��性使用nction encodeHtmlAtturn Math. clamp(v, t[x][ytyle.family + "'";
  }

  var lino1.globtyle.family + "'";
  }

 boolea Math.max(mi
   =495ED]
    chartreu播放'" + style.family + "'";
  }

 in(max, Math.max(migetter=C4DErey: '#696969',ex[Math.flresult;' +
 plemen函数，会通过escribed by
取.size 值] || 'square';
  }

  /**
   * This class imslements CanvasRenderingContext2D interface as d conteed by
   * the WHAfunction Can设置m {HTMLElement} canvasElemou may n  }

  function percent(s) {
    r~B6C1',oe this file except in complianc l; // 2F',
    darko[x][y,ound': 'ight + 'px';
    }
  hueToRgb(m1, m2, h) {
     str = colorData[styleStri;
    if (h <oro2.shacaling between no// Canlightblue: '#ADD8E6',Cap(lineCap)n = 'miter';
    this.lineCap plemen, != -1) {
      computt the 2D conte;
    this.fillStnormal',
    size: tyleStri= l; //ex[Matsize =: '#ADD8E6',
    lightctyleStrixt. This was found using
     '#DA70D6',
 ) {
    return par
    if (h <exOf(merge(cessStyle(styleStri, var processthis.canvasineJo;
    o2.globalAlpha_defaultGlemen  // Canvkeyight + 'px';
   ou may ineJoi[keyleString;
 STYLE.familwidth:' + canvasESement.clientWidth, valu
    }

    // Co   canvasEl =e';
  ement.clientHeight + 'px;overflinterpolateN2.0 ((p0, p1,2F4F4F', + 'px;height:' +
     (p
   p0r surchid: '+ p: '#F0F8FF'Element('div');
    el.style.csstextB cssText;
    ca,  //',
 rDimight + 'px';
   arts[3];
 p0eight: style.fontWeigS ISverlay'#F0FFF0',
    hotpink: ' {color: str, alpha: alpha};
  }

  var DEFAULT_STYLout,')[0]el.style.cssText = csedrabp1this.e    cannamespaces[prefix])String(16) + j.        // �per document
    if (!darts[3]2r = '[0]eight: style.fontWeight || DEFAULT_STYLE.weight,
      size: style.fontSize |#C71585',(per0; jream: 2; j5FFFA',
    mistyrose: '#Fment.appen[jndChild(overlayEl);

  ) {
    var start = styleStri  thi[jis.elemell;
  chid: lightblue: '#ADD8E6',
   #6B8E23',
    orange: '#FFA500',
    orangered: '#FF4500= el.cloneNode(false);
    // UstextBLike(dataight + 'px';
   switch (ite: '#tore has no effect
  thisaseral: '#FF7F5:        // 决定s.curr
    de [];
  };

  conte copy of thmediumspringgreen: '        // �'px;height:' +
         as per eight:  !coral: '#FF7F5 = el.cloneNode(false);
    // catmullRomIse a non transpa        // �cssText;
2, p3, t, t2, t3.
    overlay        /El.style.backgroundColor = '#fff'; //red, I don't know why, it work! 
    overlayEl.style.filter = 'alpha(opacity=0)';
    canvasElement.appendChip.x;
    this.currentue);
      this.textMeasur  this.element_2this.e3edrablineTo = lightblue: '#ADD8E6',;
        }
        str += decToHeleY_ = 1;
    this.lineScale_ = 1;
  }

  var contextPrototype = CanvasRenderingContext2D_.prototype;
  contextPrototype.clearRect = function() {
    if (this.textMeasureEl_) {
      this.textMeasurey;
  };

  contextPrototype.bezierCurveTo = funeEl_ = null;
    }
    thP1y,ll;
      ll;
r function that takes the alr                              
  };

  contextPrototype.beginPath = function() {
    // TODO: Branch current matrix so ty;
  };

  contextProtontextPrototype.lineTo = El.style.backgroundCv0'#99p   v
    v(var x = 0; x < 3entX_1= p.x3
   ar sum =;        // �ndChild(    (el);

2  //v0aCPyar sut3 != -1) {
      comput+ (-3ction(aCPx, a-     v0 -X, aY) {2   // the following is vtionrlayEttp://www.a    cp2x: cp2.x,
     loneV;
  (';
    var el = canvaS ISthat save/res';
   ++) {
        if (parts[dnight';
  eight: style.fontWeight | aCPx, aCPy);
    var [0]eight + 'px';
    }
  }

marine daryleString;
    }
   yle;
    var fontFamily;
   #F5FFFA',
    mistyrose: '#F copy ot(0) = styleStrisStyle3.0 * i]rn el;
    }
  };

 yan: '#E0FFFF',
    lightgou may re',
    dark Only add one style sheet per document
    if (!doc.sll eleme(p.x - this.currentX      aCP2x, aCP2y,
                                            aX, aYou may Document.create (var z = 0; z 
    o2.globalAlphargba2S    d(e ?  + 'px;height:' +gba[0wnerhs arfloor'wa'; (cp.quadraticCurve) * 1+ mc(aStartAngle) * 1Radius - Z2;
    var 2+ mc(aStartAngle) * 2RadiquadraticCurveTo = f' var(mocc var.join(','  //') y: p.y});
    this.cu',');
    // addarts;
  }

  function percent(s) {
    r[];
    teturn parseFloat(s) / 100;
  }

  function clamp(v, eCapMap = {
    e, VersionrocessLin
    {
    return Math.min(max, Maplemen {
    return Math.min(max, Ma this.font = '1055)] +
        decToH'#2E8m1) * 6 * // Canv= 'bu someth, that c  var el = canvasnt    rack }

ign     = o1.texont         雅�[x][y - h) * 6;
    else
  chocol
    lCon / 3 - h) * 6;
    else
 plemen = somethis.c canvasElementStart, yStart);
     conte = that c            en;pos - h) * 6;
    else
  * hCou: '#9cyan: '#00FFFF',
        aquam,
                     oneLis this.cuA2BE2',
    brown: , o2) {                  yStart: pSta * h            {};

  function processStoElement;

 ng) {
    if (styleString in processanvasElneCap;��键帧tyle.family + "'";
  }

  2.0 (th     , aWidth,   bei  }
edalmo��m'round'
  };

  function p needed
|| ss    this.lyle.size 值，key-';
  表示
    this.m_ = createMatrixIdentity();

    this.mStack_ = [];
    this.aStack_ = [];
    this.cur= l imegreen: '#     /* ms */, aY + ork! 
    overlayEl.style.fil|| sN (m2inentPath_;
    this.beginPa.textAliggetCoords(th[  this.mFE4B5',
    navajowhite: '#FFDEAD, aY);
    this.lithis.currentY_ + 2.0 / 3.0 12,    IfaY);
 is 0 != -1) {
      computedSt//  T{
  aY + ais given inis roizee) {
 s.stroke();

    this.currenElstotype.fillRect = function(aX I

  contextProt from currd: '|| sxtPrototype.fillRect = function9B4',2CC'veTon
  var Z = 10;
  var Z2 Start = getCoords(th   this.lit(0) =g) {
    var start = styleString.iX, aY:  l = clamp(p   this.closePath();
  his.cu:apes

    var) {
    var start = styleString.indexpe: arcType,n;
    o2.texrentPais.mntent. There is no way to           = function(aX0, aY0, aX1, aY} if (fontStyleCache[styleSt '#E0FFFF',
    lightg '#E0FFFF',
    lightg    this.lineTo(aX + aWidth, aY + aHeight);
    this.l, aY + parseIntaX, acanv)erCurveTo(self, cp1, cp2,  this.fiaY +    this.liadient.x0_ = aX0;
    ;
        }
        str += decToHt:' +
      ��';        // �ound using
    // trial and error ttyleCache) 每unct;
    ��ise:d by
] || 'square';
  }

  /**
   * ThisStylbace "License");
// you may nixIdentity();

    this.mStack_ = [];
    this.aStack_ = [];
    this.curdu   d License.
// gradiennt scaling between normal rt.y,
     t(0) ==textProt;        // 决定还是�, aY1, aR1) {
    var gradient = new CanvasGradient_FF',
  ��parseFloat(style.size);
'";
  }

 
    d|ring.charAdarkbluvasRenderingContext2D intme siz Knowed by
   详见{@link
  }

  function percent(sstyle. this file excepcreateMatrixIdentity();

    this.mStack_ = [];
    this.aStack_ = [];
    this.curf style.size == 'style.   alpha = +parts[3];
   dStyle.size =height;

    // and re                   ides
    image.runtimecType,
  pe: arcType,ides
    image.runtimeuseSx[Mat =ntimeSty  forex[Math      str = colorData[s,
    darkgrgreen: '#32CD32',
    linen: f(style.siius: aRad return fontStyleCache[size;
    }ius: aRadiu;
    this.lineTo(aX + aWidth, a// Cyle.sall rds(thlightblue: '#ADD8E6',
   yle.sirds(this, xStextPrototype.createRadialGr aY);

 yle.si        eight: style.fontWeight |0 / 3.0 * (cp.y - this.currentY_)
    };
    var cp2 = {
      x dw = argu        ringStyleyle.radient_('gradient');
    gradient.x0_ = aX0;
    gradient.y0_ = aY      dh = arguments   streateTds(t    sanicense.
// eyo2) {searGradientx - this.currentX_),
      rds(tLnight  dh = ar = w;
      sh = h;
    } els + aWiror('In  };
    var cp2 = {
      x: cegray: '#2F4F4F',
   
    gradient.y0_ = aY0;
 // Guess per ath_.- this.currentX_),
      firstVa: '#  dh = artext) {
    aRadius *=   if (parts[is   vatextBdChilat save/res var scanormal',
    size: 12, on that I'vC: '#2E8urrentPath_.push({ty vmlStr = [For vretuce;
  rphingn't work
    vmlStr.push(w why, i this.currentPath_ = oldPath;
 hat I've now   sx = arguments[1];
      sy&&orgotten, using divs d (cpment_.innerHTML = '';
  };0',
    cornflowerblue: '#62
  /ormal',
    size: 12,    SortX = scale as ascend* H, '"',
              id number sor   var* 6 *a, brds(this, dx, dy);

    var w2 = s a.32CC',
bt exiw / 2;
    var h2 = sh idn't work
    vmlStr.push(= getMaxe: 'uments');
    }

    var d= getCoords(this, dx, dy);

    var [0][0] != 1 leX = scaleY rror('Invtch    // in the canvas spec (yeyleString] = {
      style: style.fontStyle || DEFAUw2 = sw / 2;
    var h2 = sh / 2;

    var vmlStr = [Pchid: s  '#FFch
    // Tn't work
    vmlStr.push(kfleX, ',',his.currentY_ + 2.0 / 3.0 //    va,
                  'M12=', this.m_[1][0] /    va ',',
                  'M21 {color: str, alpha:= getCoo_)
    };
    var cp2 = {
      x/ scaleY, t(0) = = scaleY i scaleB0000][0] != 1  if (fontStyleCache[styleSt// Assum this.cuis aen: '#2 {
  it area 
    d   dh = arguments[4];
      shis.cueX = scaleY i 1;
    
    // For some reasmoveTo(aXte: 'r cp = g93',
    de  this.lineTo(aX + aWidth, aY);
xels.
  : '#B.toranspa aY, aRadius,
              }

    var d   var cp1 =nts.lengtclosePatnvalid var ceight);
    this.closePath();
    thisX + mc, c4.yyStar, c4.y2;

 ;

  var IE_VERSIONax.y, c2.y, c3.y, c4.y3aX,    // filters are bog-saX0;
    gradient.y0_ = aY0;
       ' style="l_:grouplue: '#87CEFA',
    lightster:progid:DXImageTransform.Mi 'M22=',t(0) =ords(this, dx + dw, dy + dh)STYLE.family
    };argumentachnt('dikey,
  addN y creato sp: '�upat
                    'M21=',360 % 360;playdien aresle.snce
  var fontStyleCache   st, mrKe   xSta
    if (sx || sy) {
      //leX, ',adding:0 ', mr(max.x / Z),!doc.76B',
    dark    vmlStr.push('scales to width and heightwscales to width and heightEl = el.clonspaces.add(prefix   // filters are bog-s  ' h2px;',
                  ' h3][z]ents');
    }

    var doft.Matrix('  this.lineTo(aX + aWidth, amaringb    [  micaleX,  = o1.scaleY_;
 ush('top:', mr(d.y / Z), 'px;le1];
  denrod: = [];

    // Canv
    canvasElement.appe   ' coordsize="indt('dirangx / Zh = ar calculation (need to minimikf1-',
 kf2',
      Path_;
        kff.currentPath_.push({
    //iv')d kf2 a'px;'3
    do l.style.cs  return parsen: '#8FBC8F',
    darkslateb
      vmlSt  this.lineTo(aX + aWidth, aY);
low,    drrentnexo onl  sx = arguments[1];
      sy     dar  darktur   // App+ 1   v

     var = styleString.indexOf(')', sta#C715
   hidden is[i]); i--  this.lineTo(aX + aWidth, aY);
');
    } scaleY, ,')[<= width and height
    vmlStr.push('< // Close thbrea   }
  }

  functio   'px 0;filter:progid:DXImageTransform.Microsprogid:DXImageTransform.Microsoft.Alpha(opaiis.globalAlphmissions and
// tr.push('</div>');
    
    vmlStr.pusstyle: style.fontStyle || DEFAU    vmlStr.pu   // Ap       'Dx=', mr(d.x / Z), ',',
               ageLoader(src=', image.src>',sizingMethod=scale)">');
    
    // Close the crop div if necessary            
    if (sx || sy) vmlStr.push('</div>');
    
    vmlStr.push('</div></div>'); var
    
    this.element_.insertAdjacentHTML('BeforeEnd', vmlStr.join   // Apply+ sx * dw / sw) * scale  ' coord  vmlStr.p    gold: '#FFD700',
    g    -sx * dw dth:'=src=', image.s (th]   *=', image.sr if (fontStyleCache[styleStS IS       ;
    this.lineTo(aX + aWidth, aY);
w2 = sw / 2;
    var h2 = shtHTML('BeforeEnd', vmlStr.join(''));
  };

  contextPrototype.strw= p.xchid: 'r newSeq = false /      (var i = 0; i < this.currentPath_.length; i++) {
   S ISif (argum  this.lineTo(aX + aWidth, aY);
p
  c 'M22=', 'normal',
    variant: 'To = funct    break;
  .linfeng@i : ', H,      case 'lineTo':
          lar ctr.push(' l>    
    this ?s.globalAlphax), '   v     case 'lineTo':
          l3   case 'close':
          3ineStr.push(' x ');
  2       p = null;
          breaicrosoft.MatextBaTransform.Microsoft.AlphaImageLoade p.x;
    this.currentY_ = p.y;
  };

  ctype.bezierCurveTo = functtextPrototype.w, w *(p.y));
 );
  hod=scale)">');
    
    // Close thePrototypteLinearGradienteak;
        case 'at':
        case 'n(aX, aY) {
   ent_.innerHTML = '';
  };

  contextPrototype.bush('</div>');
    
    vmlStr.push('<(''));
  };

  contextPrototype.strnused pixels.= styleString.indexOf(')', start +icrosoft.Matrix(Dx=',
                  -sx dx, dy + dh);
             mr(p.cp2x), ',', mr(p.cp2y), ',',
                       m   mr(p.x), ',', mr(p.y));
          break;
        case 'at':
        case '
    var, 1y + this.scaleY_ * p.radius), ' ',
   = styleString.indexOf(')', start + 1);xels.
  e ? 'at' : 'wa';
= styleString.indexOf(')', start +progid:DXImageTransform.Microsradius), ' ',
                       mr(p.x,
                       mr(p.xSta',', mr(p.yStart), ' ',
                       mr(p.xEnd), ',', mr(p.yEnd));
ng is broken for curves due to
      //       move to proper paths.

   / properly
      if (p) {
        Style.this.currentPath_ = oldPath;
  };

  coneJoin = 'miter';
    this., mr(p.y));
     Gradieneak;
        case 'at':
        case 'tPrototype.fillRect = functiono
      //       move to proper paths.
progid:DXImageTransform.MiL('BeforeEnd', vmlStr.join(''));
  };

  contextPrototype.str  mr(p.cp1x), ',', mr(p.cp1y), ',',
                 Use a non transpay + this.scaleY_ * p.radius), ' ',
   break;
   , case 'close   vr(p.ak;
        case 'at':
        case 'wa':
          lineStr.push(' ', p.type, ' ',
                       mr(p.x - this.scaleX_ * p.radius), ',',
                       mr(p.y - this.scaleY_ * p.radius), ' ',
                       mr(p.x + this.scaleX_ * p.radius), ',',
                       mr(p.y + this.scaleY_ * p.radius), ' ',
  lineStr) {
    var a = processStyle(ctx.strokeStyle);
 );
    var color = a.color;
    var opacity = a.alpha * ctx.globalAlpha;
DO: Following is broken for curves due to
      //       move to proper paths.

      // Figure out dimensions so we can do gradient fills
      // properly
      if (p) {
        if (min.x == null || p.x < min.x) {
          min.x l.style.cssText =    var color = a.color;
    var {
          min.y = p.y;
        }
        if (max.y == null || p.y > max.y) {
          max.y = p.y;
        }
      }
    }
    lineStr.push(' ">');

    if (!aFill) {
      appendStroke(this, lineStr);
    } else {
      appendFill(this, lineStr, min, max);
    }

    lineStr.push('</g_vml_:shaplightblue: '#ADD8E6',
   vmlStr.pu alpha:yle.sin(image, var    mintc
      sx = arguments[1];
      sy = argrt.y,
     [i]cales to width anadient_('gradient');
    gradient.x0_ = aX0;
         dh = arguments[4];E = {
    sE4C4   = 1][1] != 1 || this.m_[1][0][x][y]: = argum     }
    }
    lineStr.push('olorD:// Bounding bs(ctx, x0, y0);
        varchoc p0 = ge= 'butt';
    this.miterLiis.fon aqu p0 = gey;
   opacity = a.alpha * ctx.g    
   :/ Math.PMath.atan2(dx, dy) * 180 / M    dark;

 e cache
  var fontStyleCacheet) 
  var fontStyleCache = {}arkblu&&ntimeStyveTo'ex[Math.amily = style.fontFamily.split( darkblue:
    firebrick: '#B22222_:shape>');

    this.elemelse if (a, var_args)  n = Math.floor(percetific notation aRadT_STYLE.style,
      varyle.s = g = b = dd        if (angle < 1e-6tyle.x1_ / arcScaleXth();

    this.moveTgetCoords(thall angles produce an un     dw = argumn;
    os.lineTo(aX + aearGradient                                        aX1, aY1, aR1) {
    var gradient = new CanvasGradient_nts)));" + style.family + "ontSize;
    }

  imegreen: '#32CD32',
    linen: ',
                   xEnd: pEnd.x_ == 'gradient') {
        var x0 = E = {
    slStyle.r1_ / d 'normal',
    variant: 'lStyl = g = b = (var  p0 = getCoords(ctx, fill);
    if (styleString.charnd.x,
                 var gradient = new CanvasGradient_ction(aX, aY,
    FF',
 的   beige: '#F5F5DC'   this.moveTo(aX, aY);
  edalm aY);
    this.linegradient.x1_ = aX1;
    gradient.y1_ = aY1;
    gradient.r1_ = aR1;
    return gra;
     ,
    darkorange: '#FF8C00',
    d             x  // in the canvas spe sx, sy, sw, sh;

    // to find the original width we overStyleCache) {viole   gradie = aX0;
    gradient.y0_ = aY0;
    bstops.length;
      var color1 = stops[0].color;
      var color2 = stops[length - 1].color;
      oniumturquoise:cdoesn't account for s= stydoesn't account for skews
             t(0) ==b   };

        width  /= arcScaleX * Z;
        height /= arcSc z = 0; z < 3; z++) {
      B6C1',
  egreen: '#98FB!m2[z   if (, a high   'form  =  canvas library.m2[z7093'Copyright (c) 2013, Baidu Inc     All      s',
 erved     m2[zLICENSEm2[z    peru: '#CD853F'ecomfe/owOffsetblob/master/="', co.txtColor;
    o2.shadowOffsetowOffseffsetX;
    o2.sdep/ex color o2.s,
    royalbl      log      ' anguid o2.sHandlo_:o'./Pal.sty     Storag  o2.s#DDA0DD',
    powderb    ' anenv',
    saddlebrown: '#8B4513',
/');
    // adHTML5 Ccolor1#C71his.cnetf (!lorer!eturn parseFModern browserr1, ke Firefox, Safari, Chroreatnd Opera suppor      xStart 0
  ttern_ color1tag }

allow 2D command-based drawle.weturn parseF&& heigh) {
   b   dssh('<screa-1) {
  ality }

f (width && heigh             To if , web devel stys onlyly: '微�include filingle script,
  eturn parseFcus =eir existkblu/ hepages            eturn parseF    peruchromgoogle853F',/e& heigh colort in compli the c:/e scale.
      ize to ct si53F'svn/trunkty1, '"',.jound(scaleX     shift r th��心代码会生�func个全局变量 G_vml) {
  Manager，模块改造 lem��    l�快速判断 color支持3; z++) {
  = o1.stracity1, '"',
) {
         sienna: '#A0522D',
   skyblue: '#87CEEB',
    lotyle   = o1.str ' angle=0',
    seagree, '"city="', opacity,
 , '"'lpha;
      line       yle   = o1.str        0',
    seagree     ' yle   = o1.str     ' f0',
    seagreepositioyle   = o1.strposition0',
    seagreedecToHex[Mat = a.alpha #DDA0DD',
    powderlpha;
      line_line  = his, xS.src_,    if (实例map索引 * aRadius - Z2;

    // Iex    sapayawhiZ2;

    // IEf: '#FKener (@ * m[-林峰Widtner.linfeng@gmail',
  } else {
      var qFDAB9', 
    peruwww.: '#CD853F',
    pink be represented in binaowOffseis, xStart, ySt',');
    // add alpmeWidth pret it cor     shift owOffse.versex[Mat'2.1.0     dx = ar',');
    // adwidth'owOffseaX * m  // TODO: Figure out tnction ctterElement} dom 绘图容

   length;
      var color1 = stops[0   if (}x: Z * (aX * msrc="', fillStyle.src_, 不让外部FFF0F5E4C4: Z * (aX * m   *��啥�ow: '#ADFFfunctisFinite(�提供e {
    �letr��时减少e {
  污染和降低 o1.��冲突= o1��险�ar opacityly(creat;

 = arguments[doyEl.style.backgroundCzush(te(m) {
   (, '"(), {
    };

        _;
    ret[zr.idaX, zoldRuntimeHeighou may rn;
    }
  tyle.x1_ / a',');
    // adtype.restore 销�ar opacityessStyleCache[styleString]his.m_ = zrm) {
    
      }sFin��则m[0][1全�te(this.aStalStyle.src_, 在_;
    ret里

//0] + 也会A',
  了[0][0]) && iEEEE��就得管死  }
    }he WHAly(creat

  ose(zr)m[0][1e as dthis.mStack_.pop();
  e) {��然也
    }FFF0F5znlarged by)自己m[0][1] * m[0][a is enlarged b  // Apply scz(Dx=',
          S IS * m[1][1] - m[0][r widt a scale f p = getCoords(this, aX, aY)per document
    if (!d#C71585',/ Z)i  el.    retall angles produce an unite(m)) {
 asElScale_ = sqrt(abs(det));_:shape>');

    this._;
    return {
o1.scaleY_;
    o2.lineScalex.m_ = m;Offse

    ctx.scaleX_ = Math.sqrt(m[0][0]获取type.restore = function((this.aSt;
    t id[0] * m[1][0] [0] + a(this.aStack_.pop(), this);
      this.m_ =his.m_ = matrixMultiply(creatgetI aY) {
  // Apply scid + 'px;height:' +
     ite(m)) {
 id                       
  };

  contextP '#Dtype.restore ，: Z * (aX * marged b时会',
   ，var m1 = [
      [后xMultiply(m则返回l: '#FF7F,  s, 0],
  ps: 仅        [  }
    [ funX * msFin��表已经arged b了~~} else {
      v这是 } els摆脱e {
  a is enlarged byfacto��m[0][1 fun���]
    ];

    seanvasEk', crs.m_[youryle. dx, dy) {
 t);
    var s = ms(aRot);

    var m1 = [
      [c,  s, 0],
 trixMultiply(creatdelltiply(m1, this.m_), false);
  };

  codeleterototype.scale = functionse);
  };

  contextPrototype.rotate = f-1) {
   getnow: Cgradien(zrltiply(m + 'px;height:' +
     e *= 0.981;

    return comput1] * mltiply(m',
    lifreshNex;
  };all angles produce an unen in accource no nvasFontSize = parseFloat(element.c(aEndAngle) * aRadius - Z2;

    // I
    papayawhip   if (src="', fillStyle.src_,');
    // ad   if (接口�how m��外可用cs1.    pta,
  都�FFFA�   ];

    se非getta,
   hiffonm1, t    va链式',
   tiply(m1, this.m_), trueoat(s) / 100;
  }

  funarts;
  }

  functionelta = 1000,
      s = ms(aRot);

    �= [
    li) {
    if (this.aStack_.length) {
  dom1][0] + m[1]帮你做docungthixMu.lengthByI true);
  };
    var chis.m_ = this.mStack_.pop();
    }
  };

     s   if (= arguments[id    if) {
    if (styleString in processm = fu i true);
  }push(this.m_);
    this.m_ = m * 255)] +
    city2
   />');i�，影响代�
    dnvcity="', opacity,
 ');
) {
          ane size
 this.cuE4C4positio sqrt(abs(det));lStylpcontextPrE4C4     '  }

,mentStyle.dir ? 'right' : 'left';hfunction(E4C4        default:
        ault:
 
      ) {
          anthe Apache License, is.m_)  }

  function percent(s) {
    r this file except in complianc by offset,
  ;
    if (h < 0)
: '#FF8C00',
    d#7CFC:ar i = 0; i < 16; i++) 55)];
  e);
  };

  /**
 Cache        }
        str += decToHe ? 'right' : 'left'; = g = b =0082',
  rentY_ = p.y;
  }remove overides
    image, as there ixtPrototbrowser s  // Apply scall angles produce ayle.s 2.25;
        b sqrt(abs(det));
         yStart: pStat, since no browser soup',
                'func��改}

 itio1, mFromMap, 每次tM(this��素之前b/.test(stylase 'center':
  FIXME 有点uglh(' progid:DXItom':
        offset.y = -fonow: hi this.cuentStyle.dir.push('<g_vml_:linoldDht = delt.pusht = right = deltultiply(m1, th         ' coordsi  // Apply scelIalse);
  };

  cokviolet: : '#        get      scales to width anyle.s

  f (h < 0)
edidn't work
    vmlS.05" ',
           sy numbertroke,
            y, maxWidth,.rotate = function(aRot) {
    vm = fule(fontStyle);

    var eou may n;
    this.m_ = matrixMultip   if (ring(start xMul>');k;
    }

    switch(textA sx, sy, sw.t';
        , lineStr);
    } else {
  ('gradi��形形状到根节点,  s, 0],
   deprecated U(varyle.height;
    image{x: -left, y: 0},
add.length) , aYeatAlign.toLowertyleCache[styleString]shape/Base}  + mr + m[1][
      }
  px 'this.l��集.runtimeS各 + mrdFill(this, lineStr, {x: -left, y: 0},
addS);

            { + mr   var pStart = getCod(3) + ',0gin="',;
    }
    ctx.m_ = , aY1, aR1) {
  var skewM = m[0][0].toFixed(3) 组[0].toFixed(3) + ',' +
                m[0][1].toFixed(3) + ',' + m[1][1].toFixed(3) + ',0,0';

    var skewOffset = mr(d.x / Z) + ','Group} g;fonewM ,'" ',
                 ' offset="', s';fon= arguments[', en, left ,' 0" />',
              /g_vml_vml_:path textpathok="true" />',
                 '<g_vml_:te从.toFixed(tM(this ',' + m[1]3) + ',' +
                m[0][1].toFixed(3) + ',' + m[1][1].toFixedel) + ',0,0';

    var skewOffset = mrRot);

  + mrId    lineStr.ple(fontStyle);

    var lineStr, {x: -left, y: 0},
delkewOffset, '" origin="'   ' filled="', !s= {};

  };

  ototype.mdjacentHTML('beforeEnd', lineStr.join(''));
  };

  contextPrototype.fillText = 组t, x, y, maxWidth) {
    this.drawText_(text, x, y, maxWidth, false);
  };

  contextPrototype.strokeText = functio', enxtAlign.toLow_(text, x, y, maxWidth, true);
           '" /> inserte.measureText = function(text) {
 s.elemendjacentHTML('beforeEnd', lineStr.join(''));
  };

  contextProt     function(text, x, y, maxWidth) {
    this.drawText_(text, x, y, maxWidth, false)mo3) + ',0,0';

    var skewOffset = mr function(text, x, y, maxWidth) {
    this.drawTextunction clamp(v, Z);

    lineStr.pdFill(this, lineStr, {x: -left, y: 0},
moskewOffset, '" origin="'Id, they measureText = functio     // IgextNode(text));
element_.ownerDocument;
    this.textMeasureEl_.innerHTML = '';
       'top:-20000px;left:0;padding:0;margin:0;border:none;' +
          'w     // Ignore failures to set to invalid font.insertAdjacentHTMLunction clamp(v, ', encodeHtmlAttribute(fontStyleString),
   mo            '" />his.eleme,n(imag
    return {width: this.textMeation);
  };

  _vml_:path textpathok="true" />',
                 '<g_vml_:textpath breakype.createPattern =meWidth =               ';fonhis.x1_ = 0;
    + mr(d.y / elewM ,'" ',
                 ' offset="', s.length
              measureText = functio        addRoo!str ? 'right' : 'left';t = 0.05;
        break;
lue: '#87CEFA',
  tpathok="true" />',
                 '<g_vml_:te       break 0;
    this.r0_ = 0;
    this.x1_ = 0;
    this.y1_ = 0;
    this.r1_ = 0;
    this.colors_ = [];
  }

  CanvasGradin(text) {
type.addColorStop = function(aOffset, aColordel
    aColor = processStyle(aColor);
    this.colors_.push({offset: aOffset,
                       color: aColor.color;
    tbreak, 主要    ��functi或者组需要在下l');
 刷新。,  s, 0],
  第二else��数为repeti覆盖到 break;�� funfaultntStyle��议+ "px ;
        breah, s, l;
    h = parseFloat(parts[0]el.styo fit '#2E8'rx, y: p.y});
.width;
  atic
   w * 10canv       p = n];

  zrthis.textMeaaColor = proceis.r0_ = 0;
    this.x1_ = 0;
    this.y1_ = 0;
    this.r1_ = 0;
    this.colounction clamp(v, mctionx) {
    retuon) {
    return new CanvasPatt    switch (repetition,adieam    var m1 = [
  ffset, aColormodState != 'co:
      case '':
        this.repetition_ = 'repeat';
        break
      case 'repeat-x':
      case 'repeat-y':
  e as dzlght 

//��制配置�(3) + ',' +
  var fontStyleString = buildzLght = 1 || img.tagName != 'IMG')  resulvar p arkup/whitespace. to invalid font.[  resu.tyle.l_:gr=0] / 2;
 清空Cap;��= o1��色IERARCHY_REQUEST_ERR = 3;
  p.WRONG_mo:');Blur {
    return l��启动态模糊IERARCHY_REQUEST_ERR 2.0 (thp.WRONG_addNnow: Alpha=0.7) {
    returERR = 10;
  p.INumenWED_ERR = 7;
  p.cs1.of候+ "px + m[1�上l');
 混合的a  p.lineTo值越大尾迹越明显IERARCHY_REQUEST_ERRsubstr< 2.0 (>_SUPPORTEDatic
   ] 层 fun���d = getCoorINVALID_ACCESS_ERR = 15;
  p.VALIDrotr:');R = 16;
旋转= 14;
  p.INVALID_ACCESS_ERR = 15;
  p.VALIDscaleR = 16;
缩� = 14;
  p.INVALID_ACrocessLine.WRONG_zoomable {
    r层    chedStyle��标enderi操�l.getContexD_;
  CanvasGradient = Canvpanadient_;
  CanvasPattern = Canvas  p.TYn_;
  DOMExceptioon) {
    return new CanvasPattLayse 'center':
 (INDEX_,_SIZE_Eomplete') {
      thre.size /sManagerreturn G_vmlCanvlor = processStyle(aColor);
    this.colors_.push({offset: aOffset,
                       color: aColor.color('grad额matr��亮anvas�示+ m[��[1]) &('grad方法[0][ 2;
   tion [dx(
    'zfunctio��被p.INVAOMException_.prototype = new Errbecause they allow markup/whitespace.
    this.textMeasureEl_.appaddHoverkewOffset, '" origin="', left ,' 0" />',
   , aColor) {veMap    '<g_vml_:path textpathok="true" />',
                 '<g_vml_:tex��染OMException_.prototype = new Err= aY0;
    gradien 题
   var i  lemradient.x0_ = aX0;
  feng@gmail.com
    G_vmlCanvack_.push(  };

  contextPrototype.drawImagetStyle.size / 2neSca) {
    var dx, dy, dw, right = 0.05;
        break;
      c{offset: aOffset,
                       color: aColor.color视图更�object RegExILTIN_OBJECT = {
            '[object Fun           r            '[object RegExp]': 1,
            '[object De no ': 1,
            '[object Error]': 1,
            'rototyct CanvasGradient]': 1
        };

        var objToString = Object.prototype.toString;

        function isDom(obj) {
 epeat'      line��览�on_ = reperepeti  }
  string';
        }

        /**
         * 对        break;
    }
    switch(textAtyle(aColor);
    this.colors_.push({offset: aOffset,
                    parts[3] = 1;
           break; }
  v(
    'z obj.nodeType === 1
                   && typeof(obj.nodeName) == 'string';
        }

        /**
         * 对veMap一个object进行深度拷贝
         * @memberOf modulo.filt) {
    var dx, dy, dw,otype.toString;

        function isDom(obj) {
            return obj && obj.nodeType === 1
CESS_ERy1_ = 0;
    this.r1_ = 0>e they      repeti     r   gr',' +���te(this.aStack === 1
                   && typeof(obj.nodeName) == 'string';
        }

        /**
         * 对kewOf ','t, '" origin="'    ,  gradien度拷贝
         * @memberOf modul         result[key] = clon = Object.prototype.toString;

        function isDom(obj) {
  ��整    */
 p.N�bject RegExp]': 1,
            '[object Dsntex null) {
                var rese.size / 2 mer sqrt(abs(det));fset,
                       color: aColor.color,ction encodeHtmn_.prototype = new Error;
  his.x1_ = 0;
    this.y1_ = 0;
    this.r1_ = 0;
  ] = sum;
    IERARCHY_REQUEST_ERR = 3;
  path        tyleCache) {le.size 
    veak meow much the area.b.c来
    v深= 16;
 size ngContext2D_;
  CanvasGradient = p]Style;
    chartreuse: '#7FFF      var color1 = stops[0].color;
      var color2 = stops[lengt   h = par [];
  };

  throw n l; // acircle.    '  thi',p',
   } else {
      var q = l < 0.5 ? , q, } (rotation e     var q Whenlowing che){nimiz   offsetWhen oor(r * 255)] +
        decToate(this, o);
    thisach;
        var naentPath (img.readyState !thoords(El.style.backgroundCdStyle.size = style.size;
is, dx + dwStoph == 3 var c3 = getCoords(this, " strlter = ArrayP !!strsqrt(abs(det));
    }
  }

   = {}top = function(aO(this.m_[ getCoo// If there is a globath;
    } else {
      throw E @me(argt    =util
 n = t('.h.floor(g * 2:zrender/tool/ut  th= eE',
    lightyeetred: '#C71585',
    mid * @par        
    mintcreamradient') {
        var x0 = fillchema @pa', mr(p.cp1y), ',',
            contin.scaleX_ * p.radius), ',',
 progid:DXImageTransform.Mi @param @pa[lean} overwr[i]       p = null;
       var scaleY = this.sca    darget, source, overwrite) {
   var pEnd et;
6B8E23',
    orange: '#FFA500',
    orangered: '#FF450radius), ' ',
                 var pEnd  {*} source 源对�or offset
      var + aWi[x][yall angles produce an unlogr a = processStyle(ctx.str'P| styleS"eepskyblue: '#00BFFF',
   +util
div = document.createElemen'" arenot
     edon(ae   swit_div = document.createElemenel.':
        textA({
      type: 'bezierCurveTo'w2 = sw / 2;
    var h2 t ignore:start */
     el.__ ' ' + ss
   C4DEall angles produce an unr the Llinery
  function记x0_ = aX0;
    gr         _ctx = G_vmlCais.currentY_ + 2.0 / pret it correctly.) / 360 %     }
                    str = colorData[s _ctx =          = g = b = l; // a        {x = p:x = p1+ 1 / 3);
  /
         .adientlowing ch

    switch(textAlign         '" sendChildn:absolute;width:1px;h, h + 1 / 3);
  
                        return _ctx;
        }

      rts[i].indexOf('%') !=               ,ext('2d')e;
    var min = {x: null, y: narts[i]) * 255);
        } else this.currentPaor  n = +parts[i];
        }
       );
    gradient.x0_ = aX0;
    e,
                ay.indexOf1.x + Of(array, . We could hide all elemey.indexqrt(abs(det));
    }
  }

  contextPrototype.translvasM'    swityle.positiorget 目标对�'"',
                 r: aColor.color,m.max(width= [
   function encodeHtmis.r0_ = 0;
    this.x1_ = 0;
    this.y1_ = 0;
    this.r1_ = 0;
    this.colors_ = [];
  }

  CanvasGradityle="positiotype.addColorStop = function(aO      _ctx = G_vml++) {
        if (parts[ _ctx = document.createElemeineScale_ = 1;
  }

  v =++) {
     ight: style.fontWeight || DEFAULT_STYLE.weight,
      size: style.fontSize |ay.indexOax =

  nvasFontSize = parseFloat(element.; i++) {
     .max(maxding:0 ', mr(maxpret it correcfset,
                       color: aColor.color,ts)))
    palevioget)) {
                    // 否则�tyle.        function inher, left ,' 0" />',
    = g = b =tyle.      if (source.hasOwnProperty(key)) {
                var targloaif arender  var ArrayProto = Array.prototype;
  =fsetam {*Effectparam {*}   elarkup/whitespace.
    this.textMeasureEl_.appshowLj, cb,overwrite为tbj, cb, contebject Error]': 1,
           n;
              if (obj.fbject|Array} obj
         * @param {Function} cb
         * @param {*nyellow: '#ADFF2feng@gmail.com
    G_vmlCanvahide           }
       bject Error]': 1,
           r (var i =       if (source.hasOwnProperty(key)) {
                var targ��为 d   */
��度dFill(this, lineStr, {x: -left, y: 0},
   Widrop] ull) {
                vatStyle.size}e.size /obj) {
  sqrt(abs(de, lineStr);
    } else {
      //      高   else {
                for (var key in objHe    '                  if (obj.hasOwnProperty(key)) {
                         cb.call(context, obj[ res��导�ntext]
      to invalid font. W = 10;
    vEQUEST_ERR = 3;
  pdien', endENT_ER'#fff'] 背景R_ERR = 5;
  p.Nms.
      appenil
 片的d.y 64 ur   this.colors_ = [];
  }

  CanvasGraditoDataURL

    var p =anvas* @param {*} [c',
   var clazzPrototyasOwnProperty(key)) (obj && c           return;
          = function(aX, aY) {
    var m1 = [
  ��常�"', sk转成imhis.', skewM ,'" ',
fset = mr(d.x / Z) + ',' + mr(d.y / s.length != 4 |ersion 2.0 (thw {
 NOT_FOUND_ERR = 8;
  p.NOT_Sh      (!(obj && cb)) {
                return;apeToI {
             op / {
 ,    resEl.style.backgroundC/>');le) {
 = Object.prototype.toStrch === nati);
                           re case 'repeat-x':
      case 'repeat-ylawngr��定OMException_.prototype = new Error;
  p. '#48is.moam {Ar名�return obj &&          for (var '#48 functio响应   '[object RegExunction clamp(v, m    ext]/
        function filte                 // 否则� function inh: '#48!aFily}
         *G_vml
                 var res    }

. }
            if (obj.filter && objeat';
        break
      case 'repeat-x':
      case 'repeat-y o2.f解ray} o  }
 ault:
 空ply(lt =  y: 0}acto���   o2.fil target[key];
                if (ty      * @param {*} [context]
         * @return {Array}
         */
        function filte                 // 否则�u           }
            if (obj.filj.filter === nativeFilter) {
u               return resu if (source instanceof Array) {
                    result = [];
     ar resul�发ngth; i < len; i++) {
                    if (cb.call(context,，      ，heMap，drag，etcction filter(obj, cb '#48=ay}
   lone,
 domam {*} rkup/whitespace.
    this.textMeasureEl_.apptrigg           }
              if (j.filter === nativeFilter) {

      f: indexOf,
       if (source instanceof Array) {
               �历Date等对象的问题 get当前   if (下 y: 0}类    ��  (h��和render/totyle.后MVC和1, m1y} oam {*} ��还存umen� = 1: Z * (a'<g_v /**
         * 数组或对象遍历
                  {x: right, y: fonrepeat':
      case n ? 'right' : 'left';
      param {Object|Array} obj
         * @param {Function} cb
         * @p释p[lifig',[] 0],
   �tM(this��括dom[0][    *、render和am {Array} o）inherged b后ZRtyler Kener (@Kener-林峰, kener.linfeng@gmail.   var det = m[0][0]zrender/tool/util
         * @pp in clazzPrototype)A2BE2',
    brown:aram {Object|Array} orepeat':
     ale_ = sqrt(abs(det));        * 数       CLICK : 'click',
    lter) {
       CLIC  case 'top':
        offset.y var nativeFilter = Array */
            DBLCL
        bxtAlign = 'left';
    }

    4DE',ase 'center':
   * 窗后告诉e {
   M(this��actor
he line s[0][��想Exce��好ire','unction F() {m12, m21, m22, dx, ',
   is.element_.o < 3; z++) {
        contextProt1[x][z;
    odowOffse', [          ' g_o_:],           : '#c2.xou may : '#; 0) {
 * m2[z  conte:  @pa��辅助类
ge.s0][1] + aY * m[1][1] + m[2][1]) - Z2
    };
  };

  contex     sin：he Licnt.x0_ =* cos：余��图形元�degreeToRadia移�角度转弧   el* r标�ToD��：：      转�元�Color;
    o2.shadowOffsetbrownmath',[fsetY = o1��按�var m = ctx.m_  * @t  }
plemented.18cyan: '#00FF',');
    // add = obj.length; a           （�元�）      ngContext2D_;
  CanvasGradienise {strs��元�       // �为�元素��算，默认为urren，�元�为以}
     ��量l le     */=== +obj.length) {
-1) {
    in(�元�,        MO   }
            if (obas width/       MOU?��元�*   * 鼠�:��元�dule:zrender素移开，事件对象是：目标图形元素
             * @type {string}
             */
            MOUSEOUT : 'mouseout',
            /**
             * 鼠标按钮（手指）被按下，事件对象是：目标图e no��素或空
             * @type {string}
  e no       */
            MOUSEDOWN : 'mousedown',
            /**
          �元素
         to = Array.prototype;
    �元�，事件对象是：目标图是：目标囻开�   }
            if (ob          MOUSEDusedown',
            /**
          }
             */ut',    // 

            // 一次成功元素拖拽的行为  * @type {str�：
            // dragstart > dra/enter > dragover [> dragleave]ou may ne="100 100" coi    sin最小
    this.DOWNcos opacity = a.a是：目标� :时触发（在low: '#FFFFE0', * @type {str :�象是：被�ay) {
          : '#98FB98',
玫瑰�2.line
    papayawhip + mr(RoaY, hpuff: '#FNeil (杨骥, 511415343@qq      *   h = parserts[0]) / D : unction getC        DRAGEND : ype: rts[0]) / Z);

    // D : size_ERR = 10;  thiak;
 _ERR = 10;
  p, q, h - _ERR = 10;
  pts[2])*/
            DRr1    R : 'dragenter',
 2: 3       /**
       d          /**
       1.shktrix(': '#eee'*/
            DR[Mat) {
 : 3/
          }/
      .lengt[key],
   skewOf    '<g_vm*/ype {strid alpha if needed
 D : S thi��拽|| styleSt 2.0 (thx 中心x坐标
            /**
      y      *y拖拽图形元素离开目�r / 2' ' ���berO最大长                /**
      k 花瓣数量RR =��n为1时RR =�   (即',
         RR =��'mou��            翻倍        * @type {string[n=1] 必须为整ERR');
 �k共同决定dragle**
   量        * @type = 3;
  p��上移动='#0pe {s'] 描边CTER_ERR��标图形元素
    [MatCape='butt'] 线帽样�  */
    }
       , ram {, squar,
            /**
       : 'd) {
 在�g}
         ellay is click
         opacity在�       ��明            */
            shadowO_MOD0] 阴影;
  p.   * �大于0 0},���目标图形元素
     assNa   * @type {strinelemen          */
         elementClassNaOffsetX'zr-element'�向偏.TYPE       * debug日志选项：catchY'zr-elemen纵为true下有效
        = 3;
  p
      resul style附equir�本      * 1 : 异常抛出，�   * @type {string : �          */
            DROP 
   Font]     * 2 : �**
      eg:'bold 18px Z *dana'0,

        // retina 屏幕Ptic
   ='end,

    * 2 : ��r p ,        * tinsidext efh en    , ts(thbottom0,

        // retina 屏幕Align] 
     根据)
    };
    m22, anvasE/**
        devi��平对齐;
   _ERR = 10;
  p.INVR = 10;
  p.INVA    }
  croso, e- stl/log',['requid: = 10    * 1 : 异常抛出，�d.y [Mat   var config = require('../config');

        /**
  垂reen* @exports zrender/tool/log
         * @author Kenerire','../co, midd���CATIObetic, hanging, ideographic    */;
    o2.shadowOffset��，事件fsetX;
    o2.sd.y   rosybrownseover
    skyblue: ,
          ebrown: '#8B4513',
   sd.y unction getCoor(argfilter: fil* aRadius - Z2;

    // IE won't render archesDRAGEND : 'dont),
                             extend) {
                   d.y /**
             * 开始拖und': 'round'
  }ase 'left':
   ��标�h.floor(b * 255)];
  2BE2',
    brown:brushD1CCOaleY3',
  oke'; green��图只能g}
       ��充后果自�ow: '#ADFF2F',d.y sStyleCachnvas conte    azure: '#F0he Apache License,
              **
   t - cs2.offset;
 nreak{
                    con#  thi text baseline
    switch (this.textBaDRAGEND : ~dragover', this file except in compliancyId('wrong-message').innerHT      ML;
        };
        */
    }
);

/**
 * zrender: 生成�    l    ver',
  *
 * @author errorrik (errorrik@gmail.com)
 */

define(
    'zrender/tool/guid',[], lineStr);
D : (styleString)('wrong-message'ype: 'r     no info about the text baseline
 concat(        eak me Apache License, Version) {
    if (ingC && ob2D} ctx  return processStyleCache[styleString]il.com)
 */

define(
  * @ty, height);
        shift = 2 buildPp)]
;
  };

  contx, * @ty++) {
        if (parts[_xfunction F() {}
      _    darkgrey: 'e.

    fRstrokthisoldRuntimeHeight;

    _s = this.os = {};
      k    var o   }
  }

  functio     = sy var onicebl      str = colorData[s_ocatchBmatch(/We the MIT license.

    f      Ymatch(/Weyt[\/]{0,1}([\d.]+)/);
  seov '#6A5ACD',
    slatseovee,
                ctx.ghtsTo(       v,);?[\s\/] (array[i] === value#C71585',
    mi_      _R
    mintcreaad &&radient') {
        var x0 = _
   _R 'norextPrototype.clearRect = function() {
  = 36tion_n(this.textMeasureEl_) {
      thi_.ind_   max.y = m.max(max.y, c2.y, c* ua.maidth/_k}
  n * j %  va   var        var kindle = ua.match(/Kindle\/e nojar silk = ua.match(/Silk\/([\d._]+)/)+        v, ',',
                   _w for        var kindle = ua.match(/Kindle\/([\d.]+)/);
        var silk = ua.match(/Silk\/([\d._]+)/);
      形�r blackberry = ua.match(/(BlackBerry).*Version\Y, Z * W, ',', Z * H, '"',
 tx    matchx, _y#6B8E23',
    orange: '#FFA500',
    orangered: '#FF4500',_;
      stops.sort(function(cs1,m1, t据统计包围盒矩形ks zepto.
 */
define('zrender/tool/env',[],function() {
    // Zepto.js
    // (c)     var color1 = stops[0 + mr(d.y ~Is.heif aReded, height);
        shift = 2 getpleW
    // Zeptoay be freely distributed ize;
var o__rbj.forEach && obj.f      DRAGSTART       // To99',
    lightslategrey: '#778899',
    lightsteelblu{
        var os = this.os = {};
            var android = ua.match(/(Android);?[\s\/]+([\d.]+)?/)
        var ipad = ua..indcyan: '#00FFFF',    var iphone = !ipad && ua.match(/(iPhone\sOS)\s([\d_]+)/);
        var we aCPxua.m >roid  = webos && ua.match(/TouchPaid doe ua.mation getContext() {
            if (!_ctx) {
                  maxos = max      str = colorData[s    * @ty��标对象
         *      nerHTML =
      v    is.c = true, os.version fillmall angles produce an un    * @tymatch(/Wes.ipad = tkK]it[lt CSS.  Only add one style sheet per document
    if (!doc.ss.ipad = tru;

  var IE_VERSION = +navigator.user       // Toarkolivegreen: '#
         : -rowse-rue, os.ver*Version\/ opacity = a.alpha * cativ= true, os.version = webos[Y opacity = a.alpha * c      :ectlyrowse+ fted    * @ty opacity = a.alpha * c   resy = true, os.version = blacetCoords(ctx, fillStn this up with a better OS/browser seperation:
  '"',
                      forA0522D',
    skyblue: '.inherits(D : "', smousedown',
ou may D :    * @type {string}内外ger =�ense.
     */
            DRAGENTrochold'dragend',
            /**
             * 拖拽图形元素进入�k = true�图形元素时触发，�k = true�对象是：目标图形�k = true
             * @type {string}
             */
            DRAGENTER : 'dragenter',
           /**
        0    * 拖拽图形元素在目标图形元素上移动时触发，事件对象�
   : 't= true;
��形元素
             * @type {string}
             */
            DRAGOVER : 'dk = truever',
            /**
             * 拖拽图形元素离开目标图形元素时触发，事件对象是固定_ = ��径on =旋ense.
.SYN�标� // 映
  ��oid && !u�触发，事件对象�0       (firefox && ua.match(/Tablet/)) d llTex�内部      (fil lea��how 
    �r时ense.
��彑�        /
            DROP :ocr:');='in']a.match  //1 kindl�目标图形元素
             * @type {string}
             */
            DROP : 'drop',
            /**
             * touch end - start < delay is click
             * @type {number}
             */
            touchClickDelay : 300
        },

        elementClassName: 'zr-element',

        // 是否异常捕获
        catchBrushException: false,

        /**
         * debug日志选项：catchBrushException为true下有效
         * 0 : 不生成debug数据，发布用
         * 1 : 异常抛出，调试用
         * 2 : 控制台输出，调试用
         */
        debugMode: 0,

        // retina 屏幕优化
        devicePixelRatio: Math.max(window.devicePixelRatio || 1, 1)
    };
    return config;
});


define(
    'zrender/tool/log',['require','../config'],function (require) {
        var config = require('../config');

        /**
         * @exports zrender/tool/log
         * @author Kener (@Kener-林峰, kener.linfeng@gmail.com)
         */
        return function() {
            if (config.debugMode === 0) {
                return;
            }
            else if (config.debugMode == 1) {
                for (var k inarguments) {
              k = tr'"',throw new Error(arguments[k]);
                }
            }
            else if (config.debugMode > 1) {
                for (var k in arguments) {
                   k = true,     /* for debug
        return function(mesguments[k]);
                }
     }
        };

        /* fose 'left':
   this._hacument.getElementById('wrong-message').innerHTML =
                mes + ' ' + (new Date() - 0)
                + '<br/>' 
                + document.getElementById('wrong-message'n = kindle[1];
   ML;
        };
        */
    }
);

/**
 * zrender: 生k = true��一id
 *
 * @author errorrik (errorrik@gmail.comk = true~iew = true;
      'zrender/tool/guid',[],function() {
        vn = kindle[1];
   t = 0x0907;

        return function () {
            return  (!handleder__' + (idStart++);
        };
    }
);

/**
 * echarts�

        if (!_h[event]) {
            _h[event], lineStr);
this._havascript图表库，提供直观， (ua.m'"',，可交互，可个性化定制的数n = kindle[1];
   图表。
 * @author firede[firede@firede.us]
 * @desc thanks zepto.
 */
define('zrender/tool/env',[],fu

        if (!_h[event]/ Zepto.js
    // (c) 2010-2013 Thomas Fuchs
    // Zepto.js may be freely distributed under oc.namespaces.add(prefi_y = [];
                fx
                      fot].length; i < l; i++) {     var os = this.os = {};
           var os scales to width an    f�定      �，影响代�  // - decide if kindle fire in silk mode is android or not
        // - Firefox on Andro parts =e, os.vbos || 
    out') {

  -it[\/]{0,1}([\d.]+)/);
  a.match(/(iPad).*OS\s([\d_]+)/);d) os.ios = os.iphone = truent] && _sitiR    _(Dx=',
                  alecToH      错误)/);
        var ipoarkslategray: '#2F4F4F',
    darkslategrey: '#2 = ua.uorig           newList.push/div = [];
                ftheta}
        }
       _x
  co_Rn =  parts    r su        va0k = ua.match(/Silk\/([-lers[type])d
            va.*Version\/([\d.]+)/);
      _yhis._handlers[type]) {
        形�var args = arguments;
        args = Array/);
        v;
        var ipod = ua.matchx1)/) #00CED1',
    darkvio',
      eviolet: 的ierif';
    this.food_]+)/);
        var webnumT_STYLE.style,
     pret it correctly.while ((_rr touum00CD_handlers[type]) {
);
          
           or (var i = 0; i < len;) {ion (��从某图形�pe="on = webkit[1];

     _xar c_handlers[type]) {
                 _k = ua.match(/Silk\/([\d._]           var argLen = ar_han
    + lers[ty{
    case 2:
                       *Version\/([\d.]+)/);
        va_y          break;
              ([\d. case 2:
                        _h[/Kindle\/([\dx'], args[1);
                        break;
                    var chrome = ua.matchrome\/([\d.]+2)/) s.element_.insertAdjacenLT_STYLE.style,
     imize advise from backboni    e
          /       break;
        36     r firefox = ua.match(/Firefox\/([\d.]+)/);
        varn = kindle[1];
   match(/MSIE ([\d.]+)/);
        var safari = webkit && ua.ma;
            return this;
        }

       ar webview = ua.match(/(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/) && !chrome;
        var ie = ua.match(/MSIE\s([\d.]+)/);

        // Todo: clean this up with a better OS/browser seperation:
        // - discern (more) between multiple browsers on android
        // - de                      newList.push(_h[event][i]);
                        if (_h[event] && _h[event].length ===ram {string} type 事  }
handler         pe]) android
        // - decide if kindle fire in silk mode is android or not
        [2];
        if (iphone && !ipod) os.ios = os.iphone = true, os.version = iphone[2].replace(/_/g, '.');
        if (ipad) os.ios = os.ipad = true, os.version = ipad[2].replace(/_/g, '.');
        if (ipod) os.ios = os.ipod = true, os.version = ipod[3] ? ipod[3].replace(/_/g, '.') : null;
        if (webos) os.webos = se, os.version = webos[2];
        if (touchpad) os.  break;
              if (blackberry) os.blackberry = true
       on = blackberry[2];
        if (bb10) os.bb10     break;
      = bb10[2];
        if (rimtabletos) os.rimtabletos = true, os.version = rimtablet       if (playbook) browser.playbook = trthis._ha        if (kindle) os.kthis._hae = true, os.version = ne     */
            DRAGEN wil',
    MOUSEMOVE : 'mousemove',
            /**
             * ��图形元素�2',
      �图形元素时触发，�ne']) �对象昼�目标图形�ne']) 
           * @type {string}
           */
            AGENTER : 'dragenter'r: 4       /**
     nerHTML =: 'booverts zrender/too.heig    lu发，事件对豴�上移动时= im       return t��：目标�       return tfari &&plice(its zrender}      _ERR    * @ty {string}
             */
            DRAGOVER : 'dne']) ver',
            /**
        ['h' * 拖拽图形元素离开目标�tful#o.tablet = !!(ipad || playbook || efox && ua.match(/Ta         *erHTML ==;
    ]gmail.com)
         */
 .heig@type {strin 0)
            */
            DROP match(/Android/)) || (chrome && ua.match(/CriOS\/([\d.]+)/)) ||
            (firefox && ua.match(/Mobile/)) || (ie && ua.match(/Touch/))));

        return {
            browser: browser,
            os: os,
            // 原生canvas支持，改极端点了
            // canvasSupported : !(browser.ie && parseFloat(browser.version) < 9)
            canvasSupported : document.createElement('canvas').getContext ? true : false
        };
    }

    return detect(navigator.userAgent);
});
/**
 * 事件扩展
 * @module zrender/mixin/Eventful
 * @author Kener (@Kener-林峰, kener.linfeng@gmail.com)
 *         pissang (https://www.github.com/pissang)
 */
define('zrender/mixin/Eventful',['require'],function (require) {

    /**
     * 事件分发器
     * @alias module:zrender/mixin/Eventful
     * @constructor
     */
    var Eventful = function () {
        this._handlers = {};
    };
    /**
     * 单次触发绑定，dispatch后销毁
     * 
     * @param {string} event 事件名
     * @param {Function} handler 响应函数
     * @param {Object} context
     */
    Eventful.prototype.one = function (event, handler, context) {
        var _h = plice(idlers;

        if (!handler |   }
            }
            else **
           config.debugMode > 1) {
        for (var k in arguments) {
                           le.log(arguments[k]);
                }
            }
        };

        /* for debug
        return function(mes) {
          ne']) {
        }
mentById('wrong-message [context]
     */
    Eventful.prototype.bind = function  = neML;
        };
        */
    }
);

/**
 * zrender: 生ne']) ��一id
 *
 * @author errorrik (errorrik@gmail.comne']) ~   * @event ]) {
            _h[event] = [];
        }

       = net = 0x0907;

        return function () {
            return 标.
  der__' + (idStart++);
        };
    }
);

/**
 * echarts�eturn typeof e.zrenderX != 'undefined' && e.z      defaulne']) (styleString) {
    if (sty�观，       绑��
     */
    Eventful.prototype.unb = ne图表。
 * @author firede[firede@firede.us]
 * @desc thanks zepto.
 */
define('zrender/tool/env',[],fueturn typeof e.zrend/ Zepto.js
    // (c) 2010-2013 Thomas Fuchs
    // Zepto.js may be freely distributed // Btyle.w= iph    in kewOfBu    ;
        var ipod = ua.matcandroid    var os may be. || ua.match(/CriOS\romearc        eof e.layeof e.laraleX,e)
//   orTo =var cs           document.body.appendChilda.match(/Firefox\/([\d.]+)/);
                   e 事��match(/MSIE ([\d.]+)/);
        var safari = webkit && ua.ma        function getY(e) {
            rear webview = ua.match(/(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/) && !chrome;
        var ie = ua.match(/MSIE\s([\d.]+)/);

        // Todo: clean this up with a better OS/browser seperation:
        // - discern (more) between multiple ne && !ipod) os.ios = os.iphone = true, os.version = iphone[2].replace(/_/g, '.');
        if (ipad) os.ios = os.ipad = true, os.version = ipad[2].replace(/_/g, '.');
        if (ipod) os.ios = os.ipod = true, os.version = ipod[3] ? ipod[3].replace(/_/g, '.') : null;
        if (webos) os.webos hs arram {         -  || type, os.versiond.
/];
        if (touchpad) o      var stop = yypeof window.addEventListener === 'function'
    kberry =of windo    +eak;
                    case 3:
        stopPropagation();
     = bb10[2];
        if (rimtabletos)[1], args[2]);
                        break;
                    default:
                        // havne'])         if (kindle) os.kne'])    * @type {string}      break;
                }
                
          .save = functio
    peru: '#CD853F',
    pink:('2d');
  rrorrik (entful
             *             MOUSEOVER : 'moucomputePad).*ApBox);

/**
 * 事�veD6',s.y, curve
            }
            else if (vecar c = a.alpha ayCtor 0',
    seagreeneof  ? Array
     peof Fgmail.com)
 */
define(
    从顶点  retusalm     出元簏match(/MS    ��入`min`和`max`中  var m = this.m_,
        dector',[],function () {��
                    &&< neede>} poi',',number>} VecNOT_FOUND_ERR = 8;
  p.NOT_Smireturn parseFl�个向量
     a   */
                  * 全局�[],function () {(     /debun,0]
 s(clazz, baseClazz)      /m.max(max.x, c2.defined' && e.clientY;
        }

    style.backgroundColf         /[0][ption(s) {
  sx * dw                      out[0] = x || 0; fil           o        p = null   s'../co         return out;
        00FA9A',
    mC71585',
   1ntcrea            cradient') {
        var xrefix, u       'normal',
    varian */
 X + eam:f     if (window['G_vmlCanv2);
        out[0] = x |ument of the element.
    n {Ve>;
    ight + 'px';
    }
  }

         y: function (out, v) {
                out[0]1Vecttrget, source, overwrite) {       urn out;
        rn out;
            },

       > },

  all angles produce an un},

      向量
             * @param {Vectoor offset
     minX + mc    ndefined' && evar yStartunction getContemaxX + mcv[1];     out[0] = v[0]yStar'../cousedown',
            /**
          从三阶贝塞尔ense.
x: p.x,
      y)tor2
         */
        /**
         * 二维向量类
         *e.0 (Of;

/**
 * zrendeder/tool/vector
         */
        var vector =ERR = 15;
 p), 0, 1);
            * @return {Vectoing is brok             */
            http://dev             */
                                   */
                   * @param {numb    return out;
 
             * @param {number} [y=0]
 CubeBezier            *(p.x), ',', mr(n {Vector2}
               sxrdorigyleString;
    }

   .cubicExtne:    t0is.ele    a2d: fun3d: fu @paundefined' && e {color: str, alpha: @pa_ == 'gradient') {
        var x @pa,')[0];          At        add: function (out, v1, valse;
    var min ut = new ArrayCtory@param {Vector2} v2
             */
          vap1ctor2}2ctor2}3ctor2量�2) {
                out[0] = v1[0]量�_ == 'gradient') {
        var x量� + v2[1];
             tor2} out
             * @par

            /**
  defined' && e + v2(0) =       aout,undefined' && eam {V    out[         
      case 'bottom'     co  darktu.apply(�， v1, v2) {
          | 0;
         darkax   return out;
            },

                      return out@param {Vector2} v1    },

     **
             * 向@param              var out = new ArrayCtor(2);
                out[0] = v[0];
                out[1] = v[1];
                return out;
            },

  ��        /**
             * �向量的两个项
             * @param {Vector2} out
             * @param {number} a
             * @param {number} b
             * @return {Vector2} 结果
             */
            set: function (out, a, b) {
                out[0] = a;
                ou            },

            /**
             * 向量相加
             * @parQuadraticVector2} out
             * @pn {Vector2}
            div style/
   iturn,at
 ryle < 1)
ivmoveTx dim or y* v[1is zero减
             *
  c1];
  qnumber}
*/
   umout[0] = dd: functio��减
             *ar c          * 向量乘法
  tor2} out
       * @type {string}
  c**
     rgumenkturt1 '#0,     2BE2',
    brar c             */
   _can     mu   * @param {Vectc} v2

   tif (argLen > 4) v2[0]ar c     2ut[0] = v1[0] * v2[this.0];
*n out;
     :', W, 'px;height:', H,   bre out;
      dd:  },

            /**
        * 向�ctio        out[1] = ven >  out;
         1  },

            /**
             * 向量�          * @param {Vector2 {Vector2} ou    v1
             *      t                },

            /**
              0] / v�除法
             * @param ] / v2[1];out
             * @parut[0] = v1[0] / v2[          * @param {Vector2} v2
 ] / v2[1];
 */
            div: function           }        p = nullvar out =  darkturq      action is._xmissions and
// 
                    ut
        y1,               _h[v[0];
               */
            dot: function (v1,= v[1];
               return v1[0] * v2[0] + v12, a) {
   ow: hiddeStr.ec2.     d @namespace let: n�定m {Vector2} v
             *           m {Vector2} v
         
            },

     ����量的两个项
             * @param {Vector2} out
             tho  h : handler,  * @param {number} a
             * @param {number} b
             * @return {Vectnfeng@         o心ed(3) + ',' +
   = obj.length; 象�ustor2} o*
     *e License, Version 2.0 (thcrosoA元素     *tSize      /**
             * � 2.0 (thend, v) {
     var i      var d = vector.len(v);
      aith lockwise
    ch是顺   b��    },

            /**
             * 向量长度平方
             * @param {Vector2} v
       green:[],fuArcnction () {cument.getEle a) {
        , y, peof out, v) ner-�t;
    ;
           lenSquare:aY) {
    va 复制向量�S ISts['exbs(rn out;
  ld.s       )s[i]of e.clientnderY
                 Irea se','../mixin/Eveturn {number}
 typerototype.slice.call
        ) {
       */
          [0];
       function (v1, v2) {
   istance      return Math.sqr               var out  var w = image.wiX + mc(aStae norn out;
  r sugs[1 the MIT licens      yStart = a形� v2[1]) * (v1[1] - = args[args.lenend     + (v1[1] -m {Vector21[1] - v2[1])
          *   );
        ��方
           = args[args.lenm {Vekturn {Ve (@Kener-�     * @param {V     ax(ma     n {number}
            nction (v) {
   Th 对�to [ypeof e.client0, aY0, aR0,
       * @papush(' , v) {%离
          //red, I don't kno      * @paeblue: '#483D8B',
    dv1[0] - v2[0])
         +v1
         qrt(abs(det));
    }
  }

  c        =Vector2} o           + (v1[1] - v2[1]) * (vector2} oeblue: '#483D8B',
    dector2} out
          * 求负向量
            [1] - v2[1]) * (v1[1] - v2[1>nction (ou&& !;
                    negate: function (ou+ v1
         ultiply(m1, thi   var el 1[1] - v2[1]);
               return out;
            },

              /**
             * 插值�/red, I don't know    return out;
            },

    *maram        ndefined' && e.cliector2} outrn out;
  ,
                 1[0] - v2[0]tmnction getConte   o2.lineScale_     s 2.0 (类型
     */
   ;
     556B2=     * @param { ?  getCoPI       ?+
           * 插值��据
   �元�

   �元� * @param         
          d.
/h(/MSIE\s([\d.]+)/);

 �元�> ax = v1[0]all angles produce an un*/
           + (v1[1] -：
   1[1] - v2[1])
       
             * @p   );
         out
         = args[args.length             * @ret*/
      lenSqidn't work
    vmlStr.pu*/
          form: functiax      aCP2x, aCP2y,
                             defaul[y=0]
                {Vector   va @param {Vector2} out
    mul: funct x + m[2] * y + m[4    * 向               o{number}
             */
 3] * y + m[5];
              ar',
 ut[1] = v[1] / d;
   < 3; z++) {
      [y=0]
               * @type {string}扇'].apply     break;
                }
                
           */
            DRAGENSyCtor��拽图形元素进入�      �图形元素时触发，�      �对象是：目标图形�       = true, browser.version = chrome[1];
        if (firefox) browser.firefox = true, brow6er.version = firefox[1];
        if (ie) ax = v1[0]+ aHei_ERR = 10;
  pendE      180��形元素
 ck
          * @type {string}
             */
            DRAGOVER : 'd      vent module:zrender/mixin/Eventful#onmouseover
     * @type {Function}
     * @default null
     */
    /**��(firefox && ua.match(/Tablet/)) [r0'zr-n = id && !u[0][' +
 图将出�)));弧    inite扇         为`dow.r0`�有效
         * 0 : ax = v1[0];起        v，`   r     vector.lenSquare;
     ector2} o === 0) {
  .dis(ance;
] vector.lenSquarasGradient     Wisent_;
  C        out[1] = 0;
android || iphone || w/mixin/Eventful#onmouseout
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#onmousemove
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#onmousewheel
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#onmousedown
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#onmouseup
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#ondragstart
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#ondragend
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#ondragenter
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#ondragleave
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#ondragover
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#ondrop
     * @type {Function}
     * @default null
  context) {
        var _h =    out[dlers;

      nts[k]);
             ',[],function () {
      out[ayCtor = ty�辅助类
 * @module zrender/tool/event
 *            oa.match(/(iPad).*OS\s([\d_]+)/);
          out[1] =1] / d;
      B57',
    seashell:[],function () {
<number>} out
      ? Array
    ;
            <number>} out
 config.debugMode > 1) {
                for    *inineSm {Vector2} v
             min
  c            out[0] = m1[0] *ax                out[0] = m1[0] *athis.   scale: function (out, v, s) {
     ments) {
                           le.log(arguments[k]);
                }
            }
        };

        /* for debug
        return function(mes) {
          min(v1[0]ent.getElementById('wrong-message                + document.getElementById('wrong-message'      ML;
        };
        */
    }
);

/**
 * zrender: 生      ��一id
 *
 * @author errorrik (errorrik@gmail.com      ~, v2) {
        'zrender/tool/guid',[],function() {
        v      t = 0x0907;

        return function () {
            return 2Array|der__' + (idStart++);
        };
    }
);

/**
 * echarts�2Array|Array.<number>} a
             * @para      defaul      
        /**
        * 提取鼠�syCtor =，可交互，可个性化定制的数      图表。
 * @author firede[firede@firede.us]
 * @desc thanks zepto.
 */
define('zrender/tool/env',[],fu2Array|Array.<number/ Zepto.js
    // (c) 2010-2013 Thomas Fuchs
    // Zepto.js may be freely distributed unde    android ontext_ = ��nks zepto.
 */
  * @par+([\d.]+)?/         */
h(' progid:DXImagemarinineS            cy its squar�or.l&& !u[0,rk = ua.match(/Silkmarin    var os tations under th         && !u(0,r0, aY0, aR0,
     ow: hidde - v2[0])
e.lat) {
      : '#E9967A',
 st = vector[0,    ED1',
    darkviolet: , v1, v2, t)e.laeturn out;mlStr.push('<div === 0) {
  ( Math       var ad = a[3];
   }
);

a[0];
          outs.currentPath_.push({ty
            /**
dle\/事件过程是      * 矩lerp: function (out, v1, v2,  + ad * st;
        m {Vector}
        }
        els!   }
);

nager.initElement(_div)
    umber>var co��逆1] = 0方向，Y轴向�.NOT_FOUND_n: '#E9967A',
  : '#跟arc形堇准sFini�样n isFi了兼容echartound(scaleX * w * dw /ax = v1[0];
 -t) {
                // var  (out, v1, v2, -        lerp: function (ou@param {string} type �uni var        va        out[3] = -ac * st + cber>} v
]+([dle\/([\d        out[3] = -ac * st + cd = ua.matc
      case 'middle':
 v
  * = a+ x opacity = a.alpha * cut, a,      oh(' progid:DXImagetx + st * aty;
     rome\/([\d.[0] = a[0] * vx;
               out[0] = a[0] * vx;
               out[1] = a[1] * vy;
                out[2] .lay     return out;
            },       out[       
            var= a[2] * vx;
                      va��方
          out[0] = a[0] * vx;
    dle\/([\d@param {Float32Arut[1] = a[1] * vy;
                outy: nu0Y);
    this.lineTo(aX + aWidt] * vy;
       0          },rn out;
            },
   * @param {Float32Array|Array.<numromecloseuchs  * @type {string.clientY;
        }

        /**
        * 提取鼠标滚�ompute = a[1atch(/MSIE ([\d.]+)/);
        var safari = webkit && ua.maat32Array|Array.<number>} out
           ar webview = ua.match(/(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/) && !chrome;
        var ie = ua.match(/MSIE\s([\d.]+)/);

        // Todo: clean this up with a better OS/browser seperation:
        // - discern (more) between multiple er} rad
             */
            rotate : function(out, a, rad) {
                var aa = a[0];
                var ac = a[2];
                var atx = a[4];
                var ab = a[1];
                var ad = a[3];
              + ad * st;
           var aty = a[5FF',
    mediumaquamarit * ad;
                out[4]  = Math.cos(raFF',
    mediumaquamari       out[1] = -aa * st + x + st * aty;
                out[5] = ct * aty - st * atut
             * @param {Float32Array|Array.<number>} a
             * @param {Float32Array|Array.<num    */
>ch(/MSIE ([\d.]+)?/)[1];

��两个向量最小�r a = processStyle(ctx.str {
              return out;
            }lenSq0     ), 0, 1);
 dFill(this, l       e.returnValue两个�rn _ctx;
        }

  confX + mc');
       on = webkit[1];

     ('./tyStarvent'istanc[2].replace(/_/g, '.');
        if (matrix','./mixin/Eventful'],function (requir                return out;
            }lenSq1     ing is broken for 00CED1',
    darkviol       * @rfig'    var a * 100) + ')');
           var fig');
    vae,
                 .') : null;
        if (webos) os.web:e('./too];
        if (touchpadout', '1ouseup', 'mousedown',
      :event');
-ut', 'mouseup', 'mousedown',
    res'touchm var        'h'].call(ctx, args[1], args[2]);
                        break;
                         if (playbook) browser.playbook = tr              if (kindle) os.k                    _h[i]['hreuse   */
            DRAGENDrs do   MOUSEMOVE : 'mousemove',
            /**
             * 鼠�图形元素进入�eStyle   = o1.s��优先~
        �对象是：目标图形元                 * @type {string}
             */
            DRAGENTER : 'dragenter',
 x[1];
        if (ie) rowse��形元素
             * @type {string}
             */
            DRAGOVER : 'dringvent module:zrender/mixin/Eventful#onmouseover
     * @type {Function}
     * @default null
     */
    /0  };

       ax(v1[1], v2[1]);
                return out;
      * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#onmousemove
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#onmousewheel
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#onmousedown
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#onmouseup
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#ondragstart
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#ondragend
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#ondragenter
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#ondragleave
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#ondragover
     * @type {Function}
     * @default null
     */
    /**
     * @event module:zrender/mixin/Eventful#ondrop
     * @type {Function}
     * @default null
     */
    
    return Eventt.src;

/**
 * 事件辅助类
 * @module zrender/tool/event
 * @authorif (config.debugMode > 1) {
                for (var k in arguments) {
                    rs don't wastrguments[k]);
                }
            }
        };

        /* for debug
        return function(mes) {
                  }
       ��x坐标
        * @memberOf module:zrender/tool/event
        * @param  {Event} e   =L;
        };
        */
    }
);

/**
 * zrender: 生�ing��一id
 *
 * @author errorrik (errorrik@gmail.com)ing~函数
   derX != 'undefined' && e.zrenderX
                  环t = 0x0907;

        return function () {
            return '�才der__' + (idStart++);
        };
    }
);

/**
 * echarts�_clickThreshold < 5) {
                 ��Canvas，�le.w        /**
        * 提取鼠�   de函数
     */
    Eventful.prototype.unbncy(_图表。
 * @author firede[firede@firede.us]
 * @desc thanks zepto.
 */
define('zrender/tool/env',[],fun_clickThresholdY(e) {
            return typeof e.zrenderY != 'undefined' && e.zrenderY
                 非零     � 0)
  优化Y != 'undefined' && e.layerY
                   || typeof e.clientY e[key]var vx = v[0];
                         || typ   

e.layerY != 'undefined' && e.layerY
                   ||caleX,of e.clientY != 'undefined' && e.clientY;
        }

        /**
        * 提取鼠标滚轮变化
      环        var �   return processStyleCache[styleString]event)) {
                    return;
     ��变化，正值说明滚轮是向上滚动，如果是负值说明滚轮是向下滚动
        */
        function getDelta(e) {
            return typeof e.zrenderDelta != 'undefined' && e.zrenderDelta
                   || typeof e.wheelDelta != 'undefined' && e.wheelDelta
                   || typeof e.detail != 'undefined' && -e.detail;
        }

        /**
         * 停止冒泡和阻止默认行为
         * @memberOf module:zrender/tool/event
         * @method
         * @param {Event} e : event对象
         */
        var stop = typeof window.addEventListener === 'function'
            ? function (e) {
                e.preventDefault();
                e.stopPropagation();
                e.cancelBubble = true;
            }
            : function (e) {
                e.returnValue = false;
                e.cancelBubble = true;
            };
        
        return ) {
        if (kindle) os.ki sum += m1[x][zv1
     ��滴on(text,unction (out, v1, v2) {
ElssSt,
         if (_h[i]['o                          || even       i, 1);
                         -;
                }
                else {
                    i++;
       a        }
          : 2     }
            }
        }

        return this;
    };

    // 对象可以通过 onxxxx 绑定事件
    /**
     * @event module:zrendert browseEventful#onclick
     * @type {Function}
     * @default null
     */
    /**
          vent module:zrender/mixin/Eventful#onmouseover
     * @type {Function}
     * @default null
     */
    a 横    
                event = eveb 纵             * @inner
  tion () {

        var ArrayCtor = typeof Float32Array === 'undefined'
            ? Array
            : Float32Array;
        /**
         * 3x2矩阵操作类
         * @exports zrender/tool/matrix
         */
        var matrix = {
            /**
             * 创建一个单位矩阵
             * @return {Float32Array|Array.<number>}
             */
            create : function() {
                var out = new ArrayCtor(6);
                matrix.identity(out);
                
                return out;
            },
            /**
             * 设置矩阵为单位矩阵
             * @param {Float32Array|Array.<number>} out
             */
            identity : function(out) {
                out[0] = 1;
                out[1] = 0;
                out[2] = 0;
                out[3] = 1;
                out[4] = 0;
                out[5] = 0;
                return out;
            },
            /**
             * 复制矩阵
             * @param {Float32Array|Array.<number>} out
             * @param {Float32Array|Array.<number>} m
             */
            copy: function(out, m) {
                out[0] = m[0];
                out[1] = m[1];
                out[2] = m[2];
                out[3] = marguments) {
              t browse   if (! isZRenderElement(event)) {
                    return;
                }

                   for (var k in arguments) {
                          neenderEventFixed(event);

                // 分发config.EVENT.DBLCLICK事件
                var _lastHover = this._lastHover;
          ��手指）x坐标
        * @memberOf module:zrender/tool/event
        * @param  {Event椭a > L;
        };
        */
    }
);

/**
 * zrender: 生       ��一id
 *
 * @author errorrik (errorrik@gmail.com       ~  this._mouser>} a
             * @param {Float32Array|Array.<n= nult = 0x0907;

        return function () {
            return         der__' + (idStart++);
        };
    }
);

/**
 * echarts�

                // set cursor for root elemen      defaul       * 鼠标滚轮响应函数
       e|| (thismatch(/Firefox\/([\d.]+)/);
     构    = null��uchs。
 * @author firede[firede@firede.us]
 * @desc thanks zepto.
 */
define('zrender/tool/env',[],fu

                // s/ Zepto.js
    // (c) 2010-2013 Thomas Fuchs
    // Zepo.js may be freely distributed undewser0.552284TODO: use runtimeSt    out[4] = (ac (argLen > 4) {
     unction(out,mespaces[prefix]) {
     nt_refag
                    bhis.paintbg
                         ray.k;
         letredllTerue丯：�{
                  unctb if (laye) {
  ble) {
                            func��         左端llTecauseut[1] = 0l;
   四条三次     /**
      ar vx = v[0];
              typea, yerY != 'undefined' && ebectorCeof osition[0]  - oy,         itiob,atrix    += dx;
                            laye+ dy;
         +.position[1] +                   needsRefresh = true;
       posit+layer.dirdy;
  +         +               needsRefresh = true;
     = dy;
        er.posit       }on[0] += dx;
                           va firefox = ua.match(/Firefox\/([\d.]+)/);
   * 提取鼠标滚轮变化
                 var aty;
        bre      // 拖拽不触发click事件
                    this._clickThreshold++ar webview = ua.match(/(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/) && !chrome;
        var ie =*/
        function getDelta(e) {
            return typeof e.zrenderDelta != 'undefined' && e.zrenderDelta
                   || typeof e.wheelDelta != 'undefined' && e.wheelDelta
                   || typeof e.detail != 'undefined' && -e.detail;
        }

        /**
         * 停止冒泡和阻止默认行为
         * @memberOf module:zrender/tool/event
         * @method
         * @param {Event} e : event对象
         */
        var stop = typeof winaow.addEventListener === 'function'
            ? function (e) {
      b         e.preventDefault();
                e.stopPrray.ation();
                e.cancelBubble = true;
  G
        }
            : function (e) {
                e.returnValue = false;
                e.cancelBubble = true;
            };
        
        return                if (kindle) os.k          * @type {string}uchs
);
 �="t"hor Ke在`mas Fuchs�量 var c替代`ctx`, 会保存：目 @men_;
      ��令到 @meC     's.size +���*thor Ke var c isIder/tuchs
 a.col    ��
    vbad).*AppleW#DB7093',
    papayawhip + mr(brownuchsProxyachpuff: '#FFDAB9',n() {
   var o = {};
    copyStateB7093',     out[0] = Math.momekewOffset, '" or�按�tcher : EvlStyle @me       break;
        @nam     var q .      ��
         .parentNoring(start mas Fuchs
  this._pro.js may be free       }
                .begopact     _ERR = 10;
  pa.org/en-US/doceof e.layerY 
              \/([\d.android1eof e.lay 'dblent.zrenderX = this._                   }

 this._l    * @pa              event.;
        this._pro              this.r          'm/ Todo: c_ERR = 10;
  p      里)) ||
etitioomas Fuchs
;
  ��才能essFontSam  {Vector2} ouading()) to sort tyle.cursorfastPad).*AppleW   event.zrende               /**
      
          ;
                this._processDragEnd(isC             }

    {
             marine        th;
     le[p] =  be t);
         S ISts[i]para.x                && x    bdown:     own:     spatcher : Event) {
yousedown:    rrElement(event))               own:     re            {
                 type.arc ea. {
         (ts zrender/tool/log
   this.dispatch            aleX,;
                           event);
            },    arget
           || even roy          ;
               y|Array.<number            }
            e
     @param(v1[0], v2[0]);ownTarget = null;
}

    ;
     ay.<number>} m1
  am {Float32Arrarray|Array.<number>} m1
      ��为关�    Seg switch (repeti(      ',Vector2        
    * @ty     '�
       '

                  /*{Vector2ab *C4DE',
         deyId('wron * m2[2] + m1[2] * m2[3];
                             ctx: context ||  * @pate();
       }

            /**
       ult = [];
         g}
 �      return  var c` {
         `    a.coltack_.push(this.m_) * @ret{
      ，事件对象是：                 < 2)
      returlStyle.t
   �，事件对�lStylemi thro
                 d doenner
    分发config.EVENTolor =2
               /**
�并sh: '#  */
        /**
/
// * d && this._ needed_lastHover;
          ring(start (EVENT.GLOBALOUT            {x: right, y:[0] * mto sort tmiray: '#2F4F+ m1[3]ent = thisroideturn {number}
  
        Inv');tng
        
         * 向量-.cursor = 'default expansion = 2 * fillStyl           *_ == 'gradient') {
        v没有tyle.this._mouseDownT} v
             refix, useIDAT   /v2[1])
          //      t               
           s.currMmoveTo = function(aX, a��右�    * @retn {Ve    if (angle < 1e-6) {
Drop(eve                 if (angle < 1e-6) {
 crop div if necessary s.currL          this._processDrop(event);
                this._processDragEnd(event);
            },

            /**
             * Touch开始响CmoveTo = function(aX, at = function() {
   6 {
 +SIS,
rn _ctx;
        }

      number}
          var ou     d: fun[jse;
    var min = {x: null, , v2) {
          
     ool.sttor2}[j
    );// 阻止浏览器默认� v2[1];
          true)     top(event);// 阻止浏览器默认�* 向量缩放
        this._ event = this._zrenderEventFixed(ev var scaleY = this.sca             * Touch开始响Qf (! isZRenderElement(event)) {
           4        return;
                }

                // eventTool.stop(event);// 阻止浏览器默认事件，重要
                event = this._zrenderEventFixed(event, true);
                this._lastTouchMoment = new Date();

                // 平板补充一次findHover
                this._mobileFindFixed(event);
                this._mouseA          this._processD;
  d(ev              return o只触发 }


            clone: fu x || 0;
   if ush(' c ',
             marin      3ion = webkit[1];

                    // eventTool.stop(ec                var y = v认事件，重要
                evecce: f || ua.match(/CriOS\/([\ true);
                this._lastc     ouch结束响应函数
             // 平板补充一次fc      || ua.match(/CriOS\/([\ crop div if necessODO: Branch current mAGSTART : 'dragstart'eout','mouseup', 'mouse          'touchstart',nd', 'toucmove'
   'mouseup', 'mousenderElement= functio (event) {
     * @t分发config.EVENT.r0_ = 0;rede@firede.us]
 * @desc thanks zepd && this._lastHover.clickable)               lement(event)) {
                  = 'd': 1,
        tor2}
        ）抬起响起�           //iv)
    .INVA           *        /**
             *ype[prop] = c   // eventTool., aY1, aR1_mouseupHandler(event);
    *
       VENT.touchClickDelay / 2)useDownTar new Date();
                if (now - this._lastTouchMoment < EVENT.touchCliua.mat  this._dispa@inner
  ickHandler(event);
      (0) =               ('M�件y;
  / 3.0,
     9B4',
   �起              var resu layer.posity = true;
         },

  - this._lastClickMoment < EVENT.touchClickDelay / 2) {
                        this._dblclickHandler(event);
                        if (this._lastHover && this._las\/([\d.clickable) {
                            eventTool.stop(event);// �L止浏览器默认事件，重要
                        }
\/([\d.             }
                    this._lastClickMoment = now;
               ing is                     ndler, context) {
        x http:/                                  return handlx                                };
   new Date();
                if (now - this._lastTouchMoment < EVENT.touchClick          l.clickable) {
[0]    do0] *, x3, y});
    self.             eventTool.stop(event);// �C止�call(context, arg1, a�器默认事件，重要
                        }
            laycall(context, arg1, ar境
         * @return {Function}
         */
        function bind1Arg(handler, context) {
            return function (e) {
                return handler.call(con new Date();
                if (now - this._lastTouchMoment < EVENT.touchCli    * 向      return handler.call(context,rg2);
            };
        }*/

        function bQnd3Arg(handler, co�器默认事件，重要
                        }
unction initDomHnce) {
                 }
                    this._lastClickMoment = now;
              c {
                       ded
    ouchClickDelay / 2)._lastHouchClickDelay / 2)ax = v1[0]         * @constructor
      var         * @constrocessLin   * @param {      * @param {module:zrender/Handler} instance 控制类实例
         */
        f�值
   };

  conx {
  return out;
            },

           rg2);
            };
        }*/

        function 
            'A�件odule:zrendeturn out;
            ypeof out;
    0},

           ng@gmai(event) {
 器默认事件，重要
                        }
entfodule:zrender/Painter} painter Painter实例
          }
                    this._lastClickM/ TODOtorage Storage实例
        return handler.call(context, a      return;
    t = root;
            this.storage = storace['_' + name + 'over图�     // 各种事件标识的私有变量
            // this._hasfound = falparam {ickable) {
   r(p.yemberOf modul件，重要
                        }
   } = null;            }
                    this._lastClickMoment = now new Date();
                if (now - this._lastTouchMoment < EVENT.touchCli                     {x: right, y:             eventTool.stop(event);// �z'器默认事件，重要
                        }
          }

                            this._lastClickMoment = no       ��有          false;
          rocessLiement(event)) {
                 isEmp     ull) {
                /**
        nt);
              ;
  stClickMoment  {
       ;
            (event);//     if ou may          ;
.lentY,
    r(event);
           Hea   l        break;
                }
                
                if (_h[i]['o                        || even     i, 1);
                                         eventTool.stop(event);
                    }
                });
                      }
            }
        }

        return this;
    };

    // 对象可以通过 onxxxx 绑定事件
    /**
     * @event module:zrenderenv.osEventful#onclick
     * @type {Function}
     * @default null
     */
    /**
        vent module:zrender/mixin/Event�� ac = 部尖端ion�ouseover
     * @type {Function               ro��帠�（手指）移动响应函�_clickion䮽（salm��1);
��r.pana边缘元箽�one  = !!�    * @inner
            _click纵高: fu���wExce��尖              root.addEv          */
            mousemove: function (event) {
                if (! isZRenderElement(event)) {
                    return;
                }

                if (this.painter.isLoading()) {
                    return;
                }

                event = this._zrenderEventFixed(event);
                this._lastX = this._mouseX;
                this._lastY = this._mouseY;
                this._mouseX = eventTool.getX(event);
                this._mouseY = eventTool.getY(event);
                var dx = this._mouseX - this._lastX;
                var dy = this._mouseY - this._lastY;

                // 可能出现config.EVENT.DRAGSTART事件
                // 避免手抖点击误认为拖拽
                // if (this._mouseX - this._lastX > 1 || this._mouseY - this._lastY > 1) {
                this._processDragStart(event);
                // }
                this._hasfound = 0;
                this._event = event;

                this._iterateAndFindHover();

                // 找到的在迭代函数里做了处理，没找到得在迭代完后处理
                if (!this._hasfound) {
                    // 过滤首次拖拽产生的mouseout和dragLeave
                    if (!this._draggingTarget
                       env.osdlers;

        if (!ha                 ay|Array.    助类
 * @module zrender/tool/event
 * @author unction (out, m1, m2)config.debugMode > 1) {
                         t = a.alpha                Name, handler,     
     uire('../tool/area');
 gle Incogle Inc./**ogle Inc. * @alias module:zrender/shape/Heartsed under theconstructorsed under theextendche License, Version 2.Basesed under theparam {Object} optionssed under t/ogle Inc.var 0 (th = funca co (n a cop) {sed under    th t.call(this,in a cop);
enses/LICENSE Unl._pathProxy = new Pr agreed(Google Inc./ Licensed under der th心形绘制样式tware
// dist thenamehe License, Version 2.0 (th#stylthe License"AS IS"type {e License, Version 2.0 (th~I0 (thSCOND}ted on an "AS Icense at
/distributed under the License高亮 is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES ORhighlighhe LicITIONS OF ANY KIND, either express or implied.
// See the License for the specific lang}ed by appli0 (th.protoD, ei=icenses/LICENSED, e: 'h (th',d by applicablributed under the Li��建扇形路径ted on an "AS IS"/ You mCanvasR, VeringContext2D} ctxheight attribute have hiher express or implied.
// See the Lice  CONDITIONS OF ANY Kcific languagebuildwrit :://www.apacctx, mode licenses/LICENSEat
//
//or a =le law or agreed ||o in writing, software
// distr-boor a.begin is red by applicabl-box. EitmoveTo( COND. using c.yas using border-box. EithezierCur5
// our
//   doctype   or  (http + use Boa / 2,the-doctype)
//   or use Boy - use Bob * 2 / 3or from WebFX
//   (http://wx Sizing Beh*vior from WebFX
//   (http://webSizing Bbtml/boxsizing/boxsizing.html)
// scaling does not correctly scale strokeour
//   doctype atwg.org/specs/web-apps/current-work/#the-doctype)
//   or use Box fx.eae.nformm scaling does not correctly scale strokes.
// * Optimize. There is alwayse) {
    
/avior from WebFX
//   (http://webfx.eae.net/dhtml/boxsizing/boxsizing.html)
// or from WebFX
//   (http://wey kener.linfeng@gmail.com
define('zrenderclosewritvas using border-boxreturnftware
// dist} are not implemented.
// * Coordsi计算返回icense ��包围盒矩形idth and height style values which isn't correct.
// * Painting mode isn't implement @os;
  values which isn't corrth t~IBoundingRobtaisn't implemented.
// * Canvagetgnedeight should ing content-box by defaulif).
   *.__rectontent-box by defaul m.cos;
   use Bourn {Cs using border-box to the <canvasnt}
   !e law or agreed.isEmpty()anvasRenderingContext2D_e laws width/h(nullusing cogetContext() {
    return this.conte}
   */|
        (this.fast is assignedsoftware
// dists;
  var sqrt = isCoveright should x, yontent-box by default. IoriginPos
//   QutransformCoordToLocaled in s using border-boxx =this}.
   [0]s using border-boxd to g(c, d) /1 will do f.call(objhis {HTMLElement}
   e law use tht. Thd in anvasRenderingContext2D_}
   */2006.isInsids = m.asRenderingContext2D_cable law or agreed.or aCommands, Binds* @retlineWidth* @param {*} brushType, d inasRenderingContext2D_ slice = Array.prototype.slice;

 to the <cy
//   differeq
// Copyright util').inherits(0 (th,E-2.0nd(f, obj, }
   */0 (thoogle }
red cense* 水滴nse ��r_ar@e Lice se, Version 2.Dropletr a =author Kener (@nctio-林峰, kctio varfeng@gmail.com)r a =exampppor*t
//
//, 2);
  =turn {Funccall(arguments, 2);
  Googuments))ion 2 to in , 2);
 ({te(s)  or use B:icenace(/&/g)
   : 100,').replace(/"/y, '&quot;');
  }

  a: 4quot;');
  }

  bdoc, prefix, urn) {
 that wi: 'both'uot;');
  }

  colorix])lue      doc.namespstrokeCces.addred      doc.namespvar_args :l/box.replace(/"/ the: 'tmlAttriAndStylesh} {Funcumen}bute(s) zr.addSon 2(ion 2bute(/j, var_arND, edef may obtaiI, 2);
  supporte hroperty {number} xrgs) {
中心x坐标schemas-microsoft-com:oyfice:office')y

    // Setup default CSS.  args) {
横宽（fice')到水平边缘最宽处距离）schemas-microsoft-com:obrgs) {
纵高eets['ex_can尖端s = doc.createStyleSheetstty t} [aces[pref='fill']   ss.cssText = 'canvas{aces.='#0  // '] 填充颜色   ss.cssText = 'canvas{ult#VML');
     // defa描边ze is 300x150 in Gecko and Opevar_Ca:inlbutt'] 线帽stribu，可以是   //, ris a, squar:schemas-microsoft-com:o    }args =1ign:left var��dNamespacesAndStylesheetopacity);

 is di透明mlCanvasManager_ = {
    inshadowBlur=0] 阴影模糊度 and��于0有效300x150 in Gecko and Operdocum       'text-alig   // ze is 300x150 in Geckpt_doc || documOffsetX
      // Cr�向偏移ed.
      doc.createElement('canvas'Y
      // 纵ttachEvent('onreadystate 'canvas{ the] 图形中的附加文本,

    init_: function(doc)        'text-alignanvasze is 300x150 in Gecko and Ope theFont] d all canvasspaces aneg:'bold 18px verdanaNames   init_: function(doc) Posia co='end     all canvas位置, d stylesheihat s, lefat sonly, top, bottom,

    init_: function(doc) Align] 默认根据   /**
     自动设置，.length; i++)as_']对齐。AndStylesheet( elements using creatd styleshsthas bertupit can be usecenter,

    init_: function(doc) th tvar_ is called automatically before the page is
     * lo垂直ut if you are creating elements using createElement yd as canvas, middle, alphabetic, hanging, ideographicm:vmldefined act unction encodeHtmlAttri,['urn {Fu','.funtiext;
new /writing, ext;yright 2006 es and stynew f],//www.apacurn {Fulicenses/LICd by appli/
//th t};
  }

  fu;

    nd(f, obj, /
//writing, t(el.ownerDocu// Add namespac;

        // R2006t(el.ownerDocyright 2006 Goo
//
// Licensed under the Apache License, Version 2., 2);
   "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//);
    };
//www.apche.org/licenses/LICENSE-2.0
//
// Unless requiredby applicable law or agreed to in writing, software
// distributed under the Lss.owniis distributed on an "AS IS" BASIS,
// WITHOUT WARRANT, 2);
 R CONDITIONS OF ANY KIND, either express or implie, 2);
 ~'g_o_', 'urn:ense for the specific language governing permissigs) {
d
// limitations under the License.


// Known Issues:
//
// ttrs.widerns only support repeat.
// * Radial gradient are not imple and coordsize
          // el.getContext().sy
//   diffe, 2);
 from the canvas one.
// * ClippingdContext are not implemented.
// * Coordsize. Thes) {
h and height attribute have higher priority than the
//   width and height style values which isn't corrle and coordsize
      mode isn't implemented.
// * Canvas width/height shoul is using content-box by default. IE in
//   Quirks mode will draw the canvas using border-box. Either change your
//   doctype to HTML5
//   (http://www.wh Sizing Beatwg.org/specs/web-apps/current-work/#the-doctype)
//   or use Box Sizing Bescaling does not correctly scale strok'px';
        // In IE8 this  * Non uniform3reateElement('canvas').getContext) {

(funcrea// * Optimize. There is always room for speed improvements.
fx.eae.ney kener.linfeng@gmail.com
define('zrender/dep/excanvas',['require'],function(require) {
    
// e.width =  el.clientWidth + 'px';
        break;
      case 'height':
       e) {
    
px';
        // In IE8 this does not trigger onresize.
        el.fipx';
        // In IE8 this does not trr
  var m = Math;
  var mr = m.round;
  var ms = m.sin;
  var mc =s;
  var sqrt = m.sqrt;

  // this is used for ss.owniel precision
  var Z = 10;
  var Z2 = Z / 2;

  var IE_VERSIONight = el.clientHeight;
        }
        /d.]+)?/)[1];

  /**
   * This funtion is assigned to the <canvas> elements as element.getContext().
   * @this {HTMLElement}
   * @return {CanvasRenderingContext2D_}
   */
  function getContext() {
    return this.context_ ||
        (this.context_ = new CanvasRenderingContext2D_(this));
  }

  var slice = Array.prototype.slice;

  /**
   * Binds a function to an object. The returned function will always use the
   * passed in {@code obj} as {@code this}.
   *
   * Example:
   *
   *   g = bind(f, obj, a, b)
   *   g(c, d) // will do f.call(obj, a, b, c, d)
   *
   * @param {Function} f The function to bind the object to
   * @param {Object} obj The object that should act as this when the function
   *     is called
   * @param {*} var_args Rest arguments that will be used as the initial
   *     arguments when the function is called
   * @return {Function} A new function tha, 2);
  bound this
   */
  func, 2);
 bind(f, obj, var_ar虚线var_To'g_vscheturn f: unction() {
      return f.apply(obj, a.concat(sliceline  = errorrik (1.textBa, a.concat(slil.getContext) {
        el.ge// AddashedL     ',[of the eleme/*turn {Fu */lice
        // R= o1Pattern = [ 5, 5  will do f.censed under th2.font         implemented.
// * C}
   */ht should is usx1, y1, x2, y2,
  vaLengthlicenses/LICENSE// http://msdn.microsoftncat/en-us/library/ie/dn265063(v=vs.85).aspwidth and heig
   ctx.setcaleDasbeige: '#F5F5DC','#A5  var color[0] =2A2A',
    bu1lywood: 
    bs using border-boxviolet: '#8A2BE(  var colornd(f, obj, a, b)
  violML5
//    azuchocolate: '#D2691E',
       (: '#F0sin;
  var mc = m.cos;
  var abs = m.absd by applicabl  cadetblu
// ypeof   cyan: '#0!= 'ft-com' act as this when the fun',
 ? 5unction} f The fun8860B',
    :   cadetblue:tychange', on }

  *  x2 - x1rtychange', on }

 llbay0064y0',
    darkgrey: 'numA2BEe *
 M Eitfloord act as this whenrkmagsqrt(dx *een:+'#A9* dy) /   cyan: '#tychange', onertychange', onen: 'dx /B76B',
    darkorchid: '#llbady',
    darkred: '#8B0000',/
//flag
// ruertychange', onfor (/
//i = 0; i <
    darkre ++i @this {HTMLElement}
   eagranvasRenderingContext2D_',
    coral: '#FF7F50',
    cornflo return this.conteelseslategrey: '#2F4F4F',
    dlue: '#6oise: '#00CED1',
    darkviolet: '#9400D3'eagreen!eagrd(f, obj, a, b)
   1 +32CCwill do f.call(obj,rblue:y',
    crimson: 
    cornflowerblue: '#6495ED',
    corn}bind(f, obj, var_ar直线r a = slice.call(argumentscale   return function() {
      return f.apply(obj, a.concat(slice.call(arguments))cale};
  }

  function encodeHcaleibute(s) {
    return Strcalereplace(/&/g, '&amp;').replace(/"/gSu ne: quot;');
  }

  f
    indigo: '#4B0082',xEnd, '&quot;');
  }

  f  khaki: '#F0E68C',
   ult#VML');
      /  }

  function addNamespac10amespace(dog_vml_', 'urn:schemas-microvar_com:vml);
    addNamespace(doc, 'cale'urn:schemas-microsoft-com:of
     起点;

    // Setup default CSS.  OFFFF',
    ltyle sheet per document
    if   k 终止  lightgoldenrodyellow: '#FAFAD2','#D3D3D3',
  tyle sheet per documeno and Opera
          'text-align:left;width:300px;height:150px}';
    }
  }

  // Add namespaces and stylesheet at startup.
  addNamespacesAndStylesheet(document);

  var G_vmlCanvasManager_ = {
    init: function(opt_doc) {
      var doc = opt_doc || document;
      // Create a dummy element so that IE will allow canvas elements to be
      // recognized.
      doc.createElement('canvas');
      doc.attachEvent('onreadystatechange', bind(this.init_, this, doc));
    },

    init_: function(doc) {
      // find all canvas elements
      var els = doc.getElementsByTagName('canvas');
      for (var i = 0; i < els.length; i++) {
        this.initElement(els[i]);
      }
    },

    /**
     * Public initializes a canvas element so that it can be used as canvas
     * element from now on. This is called automatically before the page is
     * loaded but if you are creating elements using createElement you need to
     * make sure this is called on the element.
     * @param {HTMLElement} el The canvas element to initialize.
     * @return {HTMLElement} the element that was created.
     */
    initElement: function(el) {
      if (!el.getContext) {
        el.geneyde = getContext;

        // Ad= o1.scaleY_;
t to document of the element.
        addNametylesheet(el.ownerDocument);

        // R= o1.scaleY_lback content. Ther= o1.scaleY_;Google Inc.
//
// Licensed under the Apache License, Version 2. '#F8F License.
// You may obtain a copy of the Li);
// you may not use this file except in compliance with the License.cense at
//
//greenye//www.apache.org/licenses/LICENSEtext2D that wiOnlllba'ult#VM';',
  线条只能n:left andlt si后果自负tychange', onPrope   /**
       fuPublrtychange', on-2.0
//
// Unless required by applicablributed under the Lboro: var attrs = el.attributes;
        if (attrs.width && acaleR CONDITIONS OF ANY KIND, either express or impliecale~al: '#F080ense for the specific language governing permissiboro: d
// limitations under the License.


// Known Issues:
//
// eded
erns only support repeat.
// * Radial gradient are not imp) != 'a') {
      parts[3] = 1;
    }
   y
//   diffecalefrom the canvvas one.
// * Clippingvar_     // el.getContext().setHeight_(attrs.HslConh and height attribute have higher priority than the
//   width and height style values which isn't corr) != 'a') {
     mode isn't implemented.
// * Canvas width/height should is using content-box by defaulxt_ |m {*} var_t wiwill      r = hueTo= funolid'anvasRenderingContext2D_//is call为实o: '#egrey: '#2F4F4F',
    darkturq  (http
    ://www.wh
    nd(f, obj, a, b)
  3',
    deepsky  (httpErtup.www.whEnd '#00CED1',
    darkviolet: '#9400D3',
   
   * @ret h + 1 / 3);
= o1.s',
    darkcyan: '#008B8B'Rgb(p, q, h + 1 / 3);
dott2, h) {
    if (h < anvasRenderingContext2D_',
    san: '#00F function hargs   h+1)Function} f The fun2;
    else if (3 * h*h;
    else ueToRgb(m1, m2,    da: FF7F50',
    cornflo,
    cy.scaleY_d act as this when the funis u act as this when the funurn '#' + decToHex[Math.flCache = {};

  function processStor(g * 255)] +
Cache = {};

  function prrkorange: '#FF8C00',
  nitial
   *     arguments when the functio;
  var sqrt = m.sqrt;

  // this is used for HslCon var decToHex = [];
  for (var i = 0; i < 16; i++) {
    for (vl; // achromatic
    } else {
      vd.]+)?/)[1];

  /**
   * This funtion is assigned to the <canvas> elements as element.getContext().
   * @this {HTMLElement}
   * @return {CanvasRenderingContext2D_}
   */
  function getContext() {
    return this.contep, q, h - 1 / 3);/
//lse if (2 =b(p, q, h +if (2 * h s using border-box
  function anvas one.
// * Ca, b)
   *:arkoliminturn '#' + decToHex[MyleC) - str += deCache = {};

  functioy/.test(styleStringng) {
  * 255)] +
 s = getRgbHslContent(styleString);wf (2 .test(sabsturn '#' + de
         part,
    darkcyan: '#008B8B',
  += getRgbHslContent(styleString);heonly= colorData[styleS,
    lfx.eae.n] +
 ,
    darkcyan: '#008B8B',
  tyleCache[st#00CED1',
    dark *
   * @param {Function} f The fun}
   */
  function getContext() {on is called
   * @return {Function} A new function thacale bound this
   */
  funccalebind(f, obj, var_arn角星（n>3c.create slice.call(arguments
      return fusushuang (宿爽,{
      r0322, a.concat(slice.call(argumen      
   };
  }

  function encodeH
   ibute(s) ) {
    return Str
   replace(/&/g/g, '&amp;').replace(/"/"/g, 2&quot;');
  }

    function addNamespace  r: 15ly = style.fontFamn: 5y = style.fontFamdoc) {
五yle(stNamespace(d   lemoncl_', 'urn:s:schemas-microsoft-com:vml');
    addNamespace(doc, '
   'urn:schemas-microsoft-com:offtyle(st外接圆e');

    // Setup default CSS.  OnTYLE.style,
      vtyle sheet per document
    ifrFAULT_STYLE.varian��nd he.
      doc.createElemr0]FAULT_STY��部顶点（凹LE.si� varLT_STYLE.weighyou are creating elements using如果不指定此参数 and��efore th use：取相隔外LT_STYLE.�At(0的交点作FAULT_STYLE.you aremas-microsoft-com:on 指) {
��yle(st   ss.cssText = 'canvas{display:inline-block;overflow:hidden;' +
          // default size is 300x150 in Gecko and Opera
          'text-align:left;width:300px;height:150px}';
    }
  }

  // Add namespaces and stylesheet at startup.
  addNamespacesAndStylesheet(document);

  var G_vmlCanvasManager_ = {
    init: function(opt_doc) {
      var doc = opt_doc || document;
      // Create a dummy element so that IE will allow canvas elements to be
      // recognized.
      doc.createElement('canvas');
      doc.attachEvent('onreadystatechange', bind(this.init_, this, doc));
    },

    init_: function(doc) {
      // find all canvas elements
      var els = doc.getElementsByTagName('canvas');
      for (var i = 0; i < els.length; i++) {
        this.initElement(els[i]);
      }
    },

    /**
     * Public initializes a canvas element so that it can be used as canvas
     * element from now on. This is called automatically before the page is
     * loaded but if you are creating elements using createElement you need to
     * make sure this is called on the element.
     * @param {HTMLElement} el The canvas element to initialize.
     * @return {HTMLElement} the element that was created.
     */
    initElement: function(el) {
      if (!el..getContext) {
        el.ge   va = getContext;yright ma{
  t;

       to document of the element.
         slateblue: m {Hs so we
        // jm {HT;

        // Rsi);
 m {H.si var abs = /
//c  *
 sRendcored: '#8B00// ReI darkmagPI9A9A9',
   tylesheet(el.ownerDocument);


//
// Licensed under the Apache License, Version 2.[styleB48C',
    thistle: '#D8BFD8',
    tomato: '#FF6347',
    turquoise: '#40E0D0',
    violet: '#EE82EE',
    wheat: '#F5DEB3',
   cument.se that will leak memory
        el.attachEvent('onpropertychange', onributed under the Ltyle(stvar attrs = el.attributes;
        if (attrs.width && a
   R CONDITIONS OF ANY KIND, either express or implie
   ~style: styense for the specific language governing permissityle(std
// limitations under the License.


// Known Issues:
//
// 雅�erns only support repeat.
// * Radial gradient are not imp�最小
    this.textAlign = 'left';
    y
//   diffe
   from the canvas one.
// * Clippingou n     // el.getContext().setHeight_(attrs.tyle(styleStringh and height attribute have higher priority than the
//   width and height style values which isn't corr�最小
    this;
        }
        //el.getContext().setCoordsize_()
      }
      return el;
    }
  };
);
 * 255) var abs = m.abontext_ |nwill  < 2anvasRenderingContext2D_}
   *'#00CED1',
    darkv];
        }
         *   styleSyle.filter = 'alph/
//llba* 255)]_ = 1;
    this.scaleYent.* 255)rthis.lineScale_ = 1;
  0}

  var c0 your
//   doctype //;
  }

未unctioFAULT_STYLE.ily: fontFamilyutedStyle(style, e   var p = 2 * l - q;asRe= 
  }anvasRenderingContext2D_}sRenn > 4 act as this when the funRgbH {
  familyLT_STYLE.的edStyle = {};

，is.textMeasureEl_ = null;
  被取hueTAULT_ '';
  };tyle��yle, er0 act as this when the fun? r *canv(2 * = c/ n  datore no effis.textMeasureEl_ = null;
  二三四/ this.��特殊处理 act as this when the fun: reak;overlayEl);

    this.element_ = el;
    dStep =s no ef_ = 1;
    this.scaleYdereen- no e2_ = 1;
    this.scaleY0FFFF',= 556B/restoredegnd(f, obj, a, b)
  aleY_    thisel.g/ressin= p.x;
    this.current({tylue:aX, ntext2D_.prototype;
  记录) {
��;
  };用于判断so thaent-box by default. IEointListhis* 255)eTo', x: p.x[ will do f.call(objeTo', x: .push([;
    t,= p.y;
 ]nd(f, obj, a, b)
  arkslateblue: ed to     /dht- 1an b'#483Dend; i++anvasRenderingContext2D_}lue:i % 2 === 0ave/0 = f/ 3 - h) * 6;
    else
    this.currentY

  ientX_ = p.x,};

  X, atextProt

  contextPrototype. function(aX, aY) 00CED1',
    darkviolet: '#9400D3'
    this.currentY_ = p.y;
  };

  cext2D_.prototype;
  var atocolate: '#D2691E',
    coraeTo', x: [0][0],= getCoordat t1
  contextPrototype.bezierCurveTo '#483D
    this.letblue                                deepsky the alreai takes the alreaiy fixed cordinates.
  f      n = +parts[i];
        }
    violar ms = m.sinn;
  var mc = m.cos;
  var abs = m.abs;
  var sqrt = m.sqrt;

  // this i for TYLE.styprecision
  var Z = 10;
  var Z2 = Z / 2;

  var IE_VERSIONsparent background.
    overlayEl.styd.]+)?/)[1];

  /**
   * This funtion is assigned to the <canvas> elements as element.getContext(parts[i].indexOf('%') != -1) {
          n = Math.floor(percent(parts[i]) * 255);
        } else {
          n = +parts[i];
        }
        str += des(this, aCP1x, aCP
   * @retCD32'
  } 3);
 ction   h++;
   s.currentY_ + ine-banvasRenderingContext2D_str += decToHex[clamp(n, 0, 255)];
      }
      akviolet: '#9400D3',
    deeppink: '#FF1493',
str += decTo0s(this, aCP1x, aCP1y);
    var cp2 =lpha = +parts[3];
    } else if (/^hsl/.test(sstartMath.floDEFAULT_Srs = getRgbHsmove)lContent(styleString);
      stius,
       ;
                         aStartAngle, aEndAngle, str = cs *= Z;
/dhtyleCache[styleString] = {color: str, alpha   var xStart = aX + mcrmal',
    weight: 'normal',
    size: 12,           //10
    family: '微软雅黑'     //'sans-serif'
  };

  // Internal text style cache

    bound this
   */
  func
   bind(f, obj, var_arg��多ar Gvar {
    if (fontStyleCacheIsogonleString]) {
      return fontStyleCache[styleString];
 ml');
    addNamespace(doc, ' !aClo'urn:schemas-microsoft-com:offi��n xEnd.yle,
      variant: style.fontVariant || DEF represented in binary
      weight: style.fontWeight  represented in binaweight,
      size: style.foStyle[p]art �� xEnd.
    .cssText = 'canvas{display:inline-block;overflow:hidden;' +
          // default size is 300x150 in Gecko and Opera
          'text-align:left;width:300px;height:150px}';
    }
  }

  // Add namespaces and stylesheet at startup.
  addNamespacesAndStylesheet(document);

  var G_vmlCanvasManager_ = {
    init: function(opt_doc) {
      var doc = opt_doc || document;
      // Create a dummy element so that IE will allow canvas elements to be
      // recognized.
      doc.createElement('canvas');
      doc.attachEvent('onreadystatechange', bind(this.init_, this, doc));
    },

    init_: function(doc) {
      // find all canvas elements
      var els = doc.getElementsByTagName('canvas');
      for (var i = 0; i < els.length; i++) {
        this.initElement(els[i]);
      }
    },

    /**
     * Public initializes a canvas element so that it can be used as canvas
     * element from now on. This is called automatically before the page is
     * loaded but if you are creating elements using createElement you need to
     * make sure this is called on the element.
     * @param {HTMLElement} el The canvas element to initialize.
     * @return {HTMLElement} the element that was created.
     */
    initElement: function(el) {
      if (!el.getContext) {
        el.ge !aClothe WHATWG.
   * @param {HTMLElement} canvasElement The element that the 2 context should
   * be associated with
   */
  function CanvasRenderingContext2D_(canvasElement) {
    this.m_ = createMatrixIdentity();

    this.mStack_ = [];
    this.aStack_ = [];
    t
// you may not use this Apache License, Version 2. !aClock License.
// You may obtain a copy of the License at
///www.apa !aClohis.lineCap = 'butt';
    this.miterLimit = Z * 1;
    this.globalAlpha = 1;
     == xEnd.var attrs = el.attributes;
        if (attrs.width && a !aCloR CONDITIONS OF ANY KIND, either express or implie !aClo~            ense for the specific language governing permissio== xEnd.d
// limitations under the License.


// Known Issues:
//
//  returnerns only support repeat.
// * Radial gradient are not impunction(image, var_args) {
    var dx, dy, dwhis.element !aClofrom the canvas one.
// * Clippingiction(acument.createElement('div');
    el.style.cssText == cssText;
    canvasElement.appendChild(el);

    var overlayEl = el.cloneNode(false);
    // Use a non tranunction(image, var_a mode isn't implemented.
// * Canvas width/height should is using content-box by default. IverlayEl.style.filter = 'alpha(opacity=0)';
    canvasElement.appendChild(overlayEl);

    this.element_ = el;
    this.scaleX_ = 1;
    this.scaleY_ = 1;
    this.lineScale_ = 1;
  }

  var conr p = getCoords(this, aX, aY) has no efthis.currentPath_.push({type: 'moveTo', x: p.x, y: p.y});
    this.currentX_ = p.x;
    this.currentY_ = p.y;
  };

  contextPrototype.lineTo = function(aX, aY) {
    var p = getCoords(this, aX, aY);
    this.currengh       // t{type: 'lineTo', x: p.x, y: p.y});

    this.currentX_ = p.x;
    this.currentY_ = p.y;
  };

  contextPrototype.bezierCurveTo = function- 11y,
                                                       a, aY) {
    var p  getCoords(this, aX, aY);
    var cp1 = getCoords(this, aCP1x, aCP1y);
    var cp2 = getCoords(this, aCP2x, aCP2y);
    bezierCurveTo(this, cp1, cp2, p);
  };

  // Helper function that takes the already fixed cordinates.
  function bezierCurveTo(self, cp1, cp2, p) {
    self.currentPath_.push({
      type: 'bezierCurveTo',
      cp1x: cp1.x,
      cp1y: cp1.y,
        cp2y: cp2.y,
      x: p.x,
      y: p.y
    });
    self.currentX_ = p.x;
    self.currete "00" to "rt == xEnd. var decToHex = [];
  for (var i = 0; i < 16; i++) {
    for (vmeWidth;
    image.runtimeStyle.height = bHslContent(styleString);
      var str = '#', n;
      for (var i = 0; i < 3; i++) {
        if (parts[i].indexOf('%') != -1) {
          n = Math.floor(percent(parts[i]) * 255);
        } else {
          n = +parts[i];
        }
        str += dehis.currentX_),
      y: this.currentY_ + 2.0 / 3.0 * (cp.y - this.currentY_)
    };
    var cp2 = {
      x: cp1.x + (p.x - this.currentX_) / 3.0,
      y: cp1.y + (p.y - this.currentY_) / 3.0
    };

    bezierCurveTo(this, cp1, cp2, p);
  };

  contextPrototype.arc = function(aX, aY, aRadius,
                                  aStartAngle, aEndAngle, aClockwise) {
    aRadius *= Z;
    var arcType = aClockwise ? 'at' : 'wa';

    var xStart = aX + mc(aStartAngle) * aRadius - Z2;
    var yStart = aY + ms(aStartAngle) * aRadius - Z2;

    var xEnd = aX + mc(aEndAngle) * aRadius - Z2;
    var yEnd = aY + ms(aEndAngle) * aRadius - Z2;

    // IE !aClo bound this
   */
  func !aClo.globalAlpha;
    o2��塞尔曲o: '#DCDCDC',
    ghostwhite:Burrent-wor   return fuNeil (杨骥, 511415343@qqring];
    }

    var el = do           };
  }

  function encodeH           ar style = el.style;
    va           ntFamily;
    try {
      style.font = 
    indigo: '#4B0082',',
    ivory: '#FFFFF0',
   cpX1Family = style.fontFamcpY1Str.push(' ">');

    /2Str.push(' ">');

    Y2Family = style.fontFam   khaki: '#F0E68C',
      lavender: '#E6E6FA',
  fault#VML');
    }
 s to set to invalid font.
    }

    return fontStyleCache[styleString] = {
      s           #F08080',
    lightcyan: '#E0FFFF',
    lightgoldenrodyellow: '#FAFAD2',
    lightgreen: '#90EE90',
    lightgrey:  // 第一个控�YLE.;

    // Setup default CSS.  ng dsx * dw / sw * scaltyle sheet per document
    if[(sx ]sx * is.c sw * scaleX, ',D and  }

  f给则为二次mr(max.x / Z), 'px '  // Apply scales to Yidth and height
    vtyle shush('<div style="width:', Math.round(scaleX * w * dw / sw), 'px;' '#D3D3D3',
    lightpink: '#FFB6C1',
    lightsalmon: '#FFA07A',
    lightseagreen: '#20B2AA',
    lightskyblue: '#87CEFA',
    lightslategray: '#778899',
    lightslategrey: '#778899',
    lightsteelblue: '#B0C4DE',
    lightyellow: '#FFFFE0',
    limegreen: '#32CD32',
    linen: '#FAF0E6',
    magenta: '#FF00FF',
    mediumaquamarine: '#66CDAA',
    mediumblue: '#0000CD',
    mediumorchid: '#BA55D3',
    mediumpurple: '#9370DB',
    mediumseagreen: '#3CB371',
    mediumslateblue: '#7B68EE',
    mediumspringgreen: '#00FA9A',
    mediumturquoise: '#48D1CC',
    mediumvioletred: '#C71585',
    midnightblue: '#191970',
    mintcream: '#F5FFFA',
    mistyrose: '#FFE4E1',
    moccasin: '#FFE4B5',
    navajowhite: '#FFDEAD',
    oldlace: '#FDF5E6',
    olivedrab: '#6B8E23',
    orange: '#FFA500',
    orangered: '#FF4500',
    orchid: '#DA70D6',
    palegoldenrod: '#EEE8AA',
    palegreen: '#98FB98',
    paleturquoise: '#AFEEEE',
    palevioletred: '#DB7093',
    papayawhip: '#FFEFD5',
    peachpuff: '#FFDAB9',
    peru: '#CD853F',
    pink: '#FFC0CB',
    plum: '#DDA0DD',
    powderblue: '#B0E0E6',
    rosybrown: '#BC8F8F',
    royalblue: '#4169E1',
    saddlebrown: '#8B4513',
    salmon: '#FA8072',
    sandybrown:.getContext) {
        el.geMethod='clip = getContext;

       to document of the element.
        addNamespacesAndStylesheet(el.ownerDocument);

        
//
// Licensed under the Apache License, Version 2.             "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//           filse that will leak memory
        '#9ACD32'
  };


  function getRgbHslContent(styleString) {
    var start = styleString.indexOf('(', 3);
    var end = styleString.indexOf(')', start + var sqrt = m.sqrt;

  // this i��赛.x / Z), var attrs = el.attributes;
        if (attrs.width && a           R CONDITIONS OF ANY KIND, either express or implie           ~dh + sy * dh / shense for the specific language governing permissish(' ', p.type,d
// limitations under the License.


// Known Issues:
//
// radius), ','erns only support repeat.
// * Radial gradient are not impp.radius), ' ',
                       mr(p.x + this.scy
//   diffe           from the canvas one.
// * Clippingcurren-clineStare not implemented.
// * Coordsize. Thmr(max.x / Z), h and height attribute have higher priority than the
//   width and height style values which isn't corrp.radius), ' ',
              ;
        }
        //el.getContext().setCoordsize_()
      }
      return el;
    }
  }

    return '#' + decToHex[Math.floor(r * 255)] +
   ctionFF',
 * 255)(sx e: '#ungetCon, h) {
    if (h < 0)
 &&FFFF',
     }
  Y     if (max.y == null || p.y > m{
    self.currentPath_.pushcurrent-work/#the-doctype)
//   or     try {
   1ts);
   ng dCache = {};

  function processS(sx 
    } elseior from WebFX
//   (ht processStyleCache) {
    used as the initial
   *     arguments when the functi0D3',
    deeppink: '#FF1493',
    quadraticaFill) {
      appendStroke(this, lineStr);
    } else {
      appendFill(this, lineStrhape>');

    this.element_.insertAdjacentHTML('beforeEnd', lineStr.jo String(styleString);
    if (styleString.charAsh(' ', p.type,  }

  contextPyou a.radius), ',',
��  }

  co是直接从四height
    vyle, ele�并非    ��  }

  co less than 1px.
   in.x == null || p.x < min.x) {
          min.x = p.x;
        }
        if (max. lifted almost directly from
    // http://developer.mozilla.org/en/docs/Canvas_tutorial:Drawing_shapes

    var cp = getCoords(this, aCPx, aCPy);
    var p = getCoords(this, aX, aY);

    var cp1 = {
      x: this.currentX_ + 2.0 / 3.0 * _minX darkmagtyleString)) {
      var par
    } elsXFF7F50',
    cornflo, '" />'Y    );
  }

  funcgb(parts);
      a
    } else min, max) {
    var fillSax
    );
  ax
  function appendFill(ctx, lineStr, min, max) {
    var fillSaxle = ctx.f    var w
    var arcScaleX = ctx.scaleX_;
    var arcScaleY = x2p.x, y: p(sx in, max) {
    var fillysformed withY2guments[3];
      d= p.y;
    ansf   if (max.y == null || p.y > max.y) {
      ix.
 p.y;
        }
      }
    }
    lineStr.push(' ">');
 />'
    );
  }

 />'
,: 0,is, aX, aY);
    var cplStyle = ctx.filllStyl, shiyle.type_ == 'gradient') tx.scaleY_;
        illStyle.type_ == 'gradient')    if (fillStylvar xillStyle.x0_ / arcScaleXhis.element_ = el;
    str += decToHex[clamp(n, 0, 255)];
      }
      alpha = +parts[3];
    } else if (/^hsl/.t />'
  = getRgbHslContent(styleString);
   lStyleha = parts[3];
    } else {
      str = c      -);
    yleCache[styleString] = {color: str, alphavar x1 * 180Yrt = aY + ms(aStartAngle) * aRadius - Z2;

    var xEnd = aX + mc(aEndAngle) * aRadius - Z2;
    var yEnd = aY + ms(aEndAngle) * aRadius - Z2;

    // IE            bound this
   */
  func           bind(f, obj, var_arCatmull-Rom spvar_ 插值折o: '#DCDCDC',
    ghostwhite:// AdsmoothS        return fupiss  ret  bis://www.github    b fillSt)'g_vml_= {
    o2.textAlign     = o1.textAlign;
    o2.textBaseline  = 1.textBaseline;
    o2.scaleX_    = o1.scaleX_;
    o2.scaleY_     var p0 = gethe WHATWG.
   * , ',', mve may skyblue: '#87CEEB',
    slateblue: dimenss so we
           var dimensi    this.aStack_ = [];
    tinnhis vasGradient_('gradientradiali thipolate(p0, p1, p2, p3, used2, t3licenses/LICENSE    ssRen(pCP1xp0) * 0.5E9967A',
    darksv1ng or3er b1 offset,
      // oth}
   */e has(p1er b2) +ndin+ vintert31)
      return m2;
  + (-3ar stops = fi-ts[4]v0 -e.colors2
      stops.sort(functv0lors + p)];
      }his.elementcensed under the Apache License, Version 2.      var p0 = getCineWidth < 1) {
  Array}w / 2;sbHslC��STYLE.数� height att < 1) {
  boolean} isLoop2 = stops[length - 1].color
// yoaintite: '#FAEBDd.]+)?/)[1].colote: '#FAEBD7',
    aquamarine: '#7FFFD;
    ,ha;
   ,ngth - 1].acolor stops in ascenle);
 ;
    p1, cp2,or stops in ascenr  };
his.,
    darkgrey: '#istanc filierCurveTo(thisarkslateblue:tCoordslen, p) {
    self.currentPa+ stop.co+= shift .+ stop.c= 0; i [i getkes the s[i
  contextProtot floralwhite: or stops in ascenseg *
 + stop.co/ t,
      // othStyle.tStyle attr ?ps[i]:metho8FBC8F',
    darkslateblue: '#483D"100%                        'lineT *
 i / (Style-h < * (a;
   e" focus=nonelor2in, max) {
    var filien: 'rkmagenta: poired by applicable = el.sw];
  coloi: '#',
                   ierCurveTo(this, cpt. IEe IEeversed.dx %     will do f.call(objt. IEthe transformation matrption(aX, aY) {
    xt_ |a;
   x, dy);

    var w2 = sw sRen '"',
     CP2x, aC    :yle i are                       sfor '"',
     >       2e" focu- 1instanc+of CanvasPattern_) {
     3if (width && height) {3        var deltaLe2 CanvasPattern_) {
d', lineStr.join(''));
  };

  function appen;
    } else(tanceof/ Maen)               ' angle="'      if (width ft / +h < ScaleX * arcScaleX, ',',
    deltaTop =       d2ltaTop / height * arcScalehis.element_ = el;
    wsforw * w        ' angle="', anwdelt// TOngle = 0;
      var r TODurrenp, q, h - 1 / 3);
        }

      takes 1takes 2takes 3takesw, w2, w3aStartAngle, aEndAngle, w, 'px ', h, 're re1    } 2    } 3    }  ' src="'(this, aCP1x, aCP
      lineStr.push('<g_vml_:f}
   */ro1.globaen: '#228B22',
    gainsmr(max.x 平滑/ Z), 'g_vm   }
      } else {
        var p      tCoords(ctx, fillStyle.x0_, fillStyle.y0_);
        focus = {
          x: (p0.x - min.x) / width,
          y: (p0.y - min.y) / height
        };

        width  /= arcScaleX * Z;
        height      cScaleY * Z;
        var dimension = m.max(width, height);
        shift = 2 * fillStyle.r0_ / dimension;
        expansion = 2 * Alpha;
      lineStr.ength;
      var color1 = stops[0].color;
      var opacity= stops[length - 1].color;
      var opacity1 = stops[0].alpha * ctx.gft-com:o var p     li等级, 0-1ops[0].alpha * ctx.globalAlpha;
      var opacity2 = stops[length - 1].al将reate 出来的sw * scal约束在 dw /   }

  co内;
  };

  co function() {
    if (this比如 [[0, akes['&qu '&q]], 这contextProto会与e.restore = function() {
    if (this.a��heig 0;
  var decToHe做
  cont��集用ntit);
  sw * scal less than 1plength - 1].colorMatrixIdentity(), this.m1 = stops[0].alphrs = [];
      for (var i = 0; i <  var p< length; i++) {
        var stop = stopcp *
 ansion + shift + ' ' v  this.currentX_ = erwise IEcale) {
    if (!matrsforcale) {
    if (!matprevPTo',  darkkhaki: '#BDB7  /**   cte) {
    if (!mathasCth - 1].al= !!gth - 1].as.push(stop.offsetmin, maX_ = 1;
    thi
   0][1] * m[0][2',
    brown: '#A52mCanva[Infinity, {
       CanvasPattern_) {
ma *  [-{
      //rminant o CanvasPattern_) {
bezierCurveTo = s[i];
        colorsors attribute is used, the meanine = e and otylem[1][0[1][eversed.
      lineStr.pt can be used asax(max][0] ctor
      // for width.
     d', lineStr.join('  th��unctio }
  };

  funcatrixI       ' angle="',used as a scale factgth - 1].a[0
  contextPrototype. det = m[0][0] * m[1], aY) {
   fixed cordinates.his.element_ = rea is enlarged by the
      // transformation. So its square root ca'lineTo',if (width &         ' angle="', angm;

    ctx.scaleX_ = _ = Math.sqrt(m[0][0] * m[0][0] ontext_ focus.x, ',', focus.y, '" />');m;

    if (width &Styl  var d     va CanvasPattern_) {
    .sqrt(m[0cScaleY, '"'  deltaTop / height * arcScale}i];
        }
    ,
    deeppink: '#FF1493',

     (fillS||blue==        '3];
    } else if (/^hs

    s      anslateclony2
      /])is, aX, aY);
    var cpmespacntin'#8FBC8F',
    daX, aY) {
    var m1 = [
  [
      [aX, 0,  0],
      [0, 0, 1]
    ];

    setM(thiply(m1, this.m_), false);se);
  };

  contextProotype CanvasPattern_) {
    d', lineStr.join('his.element_ = el;
  and osub(v,;
  };

  ,1]
    ];
   bezierCurveTo(this, usenctiree to scale thectiodlexMultring];
    }

    vrm = fun2, 0ion(vsFinite(
      x: p.x,
     push(sReny and o:opacity2
     m21, m22, dx,s, m, true);
  };

  e IE   * The text drawing f.sqrt(m[0   * The maxWidth argumsume.tytyled)];
      }
      a
   *um !P2x,   ];

    setM(this, mad0 /=it ys, aX, aY);
    var cp11dth, stroke) {
    var m rototype.setTransform = fun
    ]1;

  -d0ar m1 = [
      [1,  0,  0  right2;

  d ' colors="', colors.joic;
   rm = fuadd([kes the ,e.coneStr = [];

    var fonnt isn't tatComputedStyle(ptyle.x0_ / arcScaleX1][1] * m[1][1]);

    if (updateLine [1,  0,  0],
 c  //yle);mi chocolate: '#D2691Ee.translate = fyle);

    age yStyleString = buildStyle(fontStyl1);

1   var elementStyle = this.element_.curreowerCase(    var textAlign = t;');

    // If filultiply(cp,
        offset = {:
        brocessFontStyle(ush('<g_vml_:fill type="', 
      [-s, c, 0],
      [0,  Multiply(m1, this.m_),:
  shift() };

  contextPrhis.element_ = }
   */cp0%"',
     '#228B22',
    gains == xEnd.
    if (xStart == xEnd &&PolyClockwise) {
  nction() {
      return f.apply(obj, a.concat(slice.call(argumenis.m_ =tAlign};
  }

  function encodeHe text ar style = el.style;
    vae text ntFamily;
    try {
      style.font =// '&qx100ty()���End.
    var w2 = sw / 2;
   :_.length) {
    th) {
      co, leng  copypush(' ">');

   ces.add(prefs to set to invalid font.
    }

    return fontStyleCache[styleString] = {
      se text 'urn:schemas-microso 'canvaseTo', x: p    // to acity1 = stop0x150 in Gecko and Opervar p='lign��否  }

  linngle ,
    thi��法d styl选择 curren,           var doc = opt_doc || var p1] * m[0][]
    thi);
     ss.cssText = 'canvas{display:inline-block;overflow:hidden;' +
          // default size is 300x150 in Gecko and Opera
          'text-align:left;width:300px;height:150px}';
    }
  }

  // Add namespaces and stylesheet at startup.
  addNamespacesAndStylesheet(document);

  var G_vmlCanvasManager_ = {
    init: function(opt_doc) {
      var doc = opt_doc || document;
      // Create a dummy element so that IE will allow canvas elements to be
      // recognized.
      doc.createElement('canvas');
      doc.attachEvent('onreadystatechange', bind(this.init_, this, doc));
    },

    init_: function(doc) {
      // find all canvas elements
      var els = doc.getElementsByTagName('canvas');
      for (var i = 0; i < els.length; i++) {
        this.initElement(els[i]);
      }
    },

    /**
     * Public initializes a canvas element so that it can be used as canvas
     * element from now on. This is called automatically before the page is
     * loaded but if you are creating elements using createElement you need to
     * make sure this is called on the element.
     * @param {HTMLElement} el The canvas element to initialize.
     * @return {HTMLElement} the element that was created.
     */
    initElement: function(el) {
      if (!el.getContext) {
        el.getextBase = getContext;

        // Adheight /= arcSy, maxWidth) {type: 'cFFF5EE',
    sienna: '#A0522D',
    skyblue: '#87CEEB',
    slateblue: '#6A5ACD',
    slategray: '#708090',
  var p0 = gelback content. Therheight /= arc this.drawText_(text,       maxWidth, true);
  };

 type: 'y: '#708090',
    slategrey: '#708090',
    snow: '#FFFAFA',
 th = stops.length;
      var color1 = stops[0].colorxtAlign =B48C',
    thistle: '#D8BFD8',
    tomato: '#FF6347',
    turquoise: '#40E0D0',
    violet: '#EE82EE',
    wheat: '#F5DEB3',
   e text bas//www.apache.org/licenses/LICENSE-2.0
//
// Unless requiredgradient.r0_ = aR0;
    gradient.x1_ = aX1;
    gradient.y1_ = aY1;
    gradient.r1_ = aR1;
   e text R CONDITIONS OF ANY KIND, either express or impliee text ~le.size / 2.2args) {
    var dx, dy, dw, dh, sx, sy, sw, sh;

    // to find the original width we overide the width and height
    t = thiserns only support repeat.
// * Radial gradient are not impres to set to invalid font.
    }
    
    // Dy
//   diffee text from the canvas one.
// * ClippingpillText are not implemented.
// * Coordsize. Th    // toh and height attribute have higher priority than the
//   width and height style values which isn't corrres to set to invalid  mode isn't implemented.
// * Canvas width/height should is using content-box by defaulCoor��然能重用bt#VMncale // ��底层      基于性能考虑ge i��复代码减少调用吧ath_.push({type: 'lineTo', x: p.x, y: p.y});

   var textAlign = t
  c��始ct =��结束点0_ = 0 0;
    this.colorbuted under the = el.st   this the already  * The maxWidth argumfuncti the alreao(self, cp1, cp2-ply(is.currentX_),
      y:ng] &&(aCo   ];

    setM(this, ma         urlyw=(aCourly&&}

    lineStr.push('</g_vm    ',
       1]   ];

    setM(this, matrixs, c��除    �� dw / 点 [
      [m11, m12, 0],
      this.copvas using border-boxue);

  };

  contextPro else if (3 * h </et: aOffset,
         o(self, cp1, cp2)';
    canvasElement.append
  c��于2sValid就 sty��了~var textAlign = this.os;
  var abs = m.ab1000,
        left = 0,
   * @rets, o);
&&     mas, o);
t_ ='      
    };
    var cp2 = {
 D_(canntrolt(m[0 ' mef (!this.ted act as this when the funtition) {ts);
   inite(m[: '#t_ = image.hei1] * m[0][used as the initial
   *p, q, h - 1 / 3);
    }

    retnction that takes the already fixed cordinates.
  fthis.font), var textAlign = this.tr fonthe transformation ctx.m_ =  || img.tagName != 'IMG') s[i];
     f, cp1, cp2,var textAlign = this.arkslateblue: '#483Dation. So its square root can be

    e IEsrc_ = image.[X, a_vml_:fill',
               brsforeption_(s) {
    thaLeft = -min.x;
        var   thlor);
    thitotype.scale = function(aX, aY) ' ">');

    if (!aFill) {
      appendStroke(this,ion DOMtakesARCHre rc       R = re retakes [1]' + this.code;
  }
  var   var textAlign = this.

  };

  contextPr
    var m1 = [
      [aX, 0,  0],
      [0,  aY,       throwE,  0tion('SYNTAX_ERR');
    }

    t   this.heighsrc;
    0 = geion assertght;
 ACTER_ERR = 5;
  p.NO_DATolor: aColor.color,
     
      r = hueToRgb(p, q, h + 1 / 3);
      g = hueToRgb(p, q, h);
 );
      b = hueToRgb(p, q, h - 1 / 3);
   ;
  }

  function assertImageIsValid(img) {
    if (!img || img.nodeTy

      // When co, llor);
    th // transformaATE_ERR');
    }
  }

  function th_.push({
      type: 'bezierCurveTo',
      cp1x: cp1.x,
      c  p.NO_DATA_ALLOWED_ERR = ntPath_.push({
      type: 'bmageIsValid(img) {
    if (!img || img.nodeTyon_;
})();

} // if
el;
  }

  function hueToRgb(m1, m2, h) {
    if (h < 0)
          h++;
    if (h > 1)
      h--;

    if (6 * h }
    lineStr.push(' ">');
1 + (m2 - m1) * 6 * h // define
;
/**
 * @module z
  func[styleString];
    }

    var s0)
      h+;
    else if (2 * h < = {
    style: 'normal',
    vh < 2)
      return m1 + (m2 - m1) * (2 / 3 - h) * 6;
    elsehis, lineSne(
    'zr
    cadetblue: '#5F9EA0',
    ERR = 17;

  // set up externs
  G_vmlCanvasManager = G_vmlCanvasManager_;
  CanvasRenderingContext2D = CanvasRenderingContext2D_;
  CanvasGradient = CanvasGr
      return m1;
  }

  var processStrocessStyleCache = {};

  function prh;
    this.heigh,
     ierCurveTo',
        '1   c       '[object CanvasGradient]  type: 'bezierCurveTo',
      c         '[object CanvasGradient]'e(
    'zrender/tool/util',['require','tiveForEach = ArrayProto.foon_;
})();

} // if
else {bject Function]': 1,
            '[object xp]': 1,
            '[object Dat);
    this.colors_.push({     '[obj     }

        /**
         * 对一个object进行深度拷jToString = Object.prototype.toSnction that take{*} source 需要进行拷贝的对象
   jToString = Object.prototype.toSe(
    'zrender/tool/util',['requirACTER_ERR = 5;
  p.NO_DATA_ALLOWED_ERR = 6;
  p.INVALID_MODI  cp2y: cp2.y,
  ;
  var mc = m.cos;
  var abs = m.abs;
  var sqrt = m.sqrt;

  // this is used for s== xEnd.  }

  conte阵.createPattern = function(image, repetition) {
    return new CanvasPattern_(image, repebHslContent(styleString);
      var str = '#', n;
      for (var i = 0; i < 3; i++) {
        if (parts[i].indexOf('%') != -1) {
          n = Math.floor(percent(parts[i]) * 255);
        } else {
          n = +parts[i];
        }
        />'
    Nt-com.MAX_VALUE  * The maxWidth argum     va         IN   result = {};
             tyle =             result = {};
                        if  key in so   this.x1_ = 0;
    this.y1_ = 0;
    this.r1_ = 0;
    this.colorea is enlarged btext2D = CanvasRenderingContext2D_;
  CanvasGradient = peat';
      bezier <{
      ];

    setM(this, matrix/>'
         }

      feng@gmail.com
    G_vmlCanvasManager = fals          }

       >     eturn source;
        }

    tx.scanction mergeItem(target, source, key, overwrite) {
            if (source.ha1       Yeturn source;
        }

      le = 'object'
     t[key];
                if (typeof targetProp == 'object'
      nProp         && !BUILTIN_OBJECT[ob      ing.call(targetProp)]
                    // 是否为 r y1 = fillStyle.y1_ / arcScaleYhis.currentX_),
      y: this.currentY_ + 2.0 / 3.0 * (cp.y - this.currentY_)
    };
    var cp2 = {
      x: cp1.x + (p.x - this.currentX_) / 3.0,
      y: cp1.y + (p.y - this.currentY_) / 3.0
    };

    bezierCurveTo(this, cp1, cp2, p);
  };

, cp2, p);
  };

  contextPrototype.arc = function(aX, aY, aRadius,
 
        var dx     aStartAngle, aEndAngle, aClockwise) {
dy = p1.y - p0.yType = aClockwise ? 'at' : 'wa';

 , dy) *180 / Math.PI;

        // The angle should be  non-neative number.
        if (angle < 0) {
          ang//10
    family: '微软雅黑'     //'sans-serif'
  };

  // Internal text style cache
e text  bound this
   */
  funce text bind(f, obj,, var_arg 0;
      turn function() {
      return f.apply(obj, a.concat(slice  default:
        textAl:
       is no info about the te, y, maxWidth, t) {
                meeline) {
      case 'hanging':
.INVAtFamily;
    try {
      style.font =  case 'middle':
        b  defau    bre   case null:
    ;
    to
            doc.namesp    lavenderbluspurplhabetic':
      case 'ideographic':
      case 'bottom':
        offset.y = -fontStyle.sivar_'urn:schemas-microso].col.<ft-com> }

    switrRect =
    
      case 'right':
      |ght = delta / 2delta;
        right = 0.05;
        break;
      case 'center':
        left = right = delta / 2;
        break;
    }

    var d = getCoords(thra
          'text-align:left;width:300px;height:150px}';
    }
  }

  // Add namespaces and stylesheet at startup.
  addNamespacesAndS50px}';
    }Join='miter Add n段连接spaces and styleshecanvat startupbevelroked="', !!stroke,
                 '" style="position:absolute;width:1px;height:1px;">');

    if (stroke) {
      appendStroke(this, lineStr);
    } else {
      // TODO: Fix the min and max params.
      appendFill(this, lineStr, {x: -left, y: 0},
                 {x: right, y: fontStyle.size});
    }

    var skewM = m[0][0].toFixed(3) + ',' + m[1][0].toFixed(3) + ',' +
                m[0][1].toFixed(3) + ',' + m[1][1].toFixed(3) + ',0,0';

    var skewOffset = mr(d.x / Z) + ',' + mr(d.y / Z);

    lineStr.push('<g_vml_:skew on="t" matrix="', skewM ,'" ',
                 ' offset="', skewOffset, '" origin="', left ,' 0" />',
                 '<g_vml_:path textpathok="true" />',
                 '<g_vml_:textpath on="true" string="',
                 encodeHtmlAttribute(text),
                 '" style="v-text-align:', textAlign,
                 ';font:', encodeHtmlAttribute(fontStyleString),
                 '" /></g_vml_:line>');

    this.element_.insertAdjacentHTML('beforeEnd', lineStr.join(''));
  };

  contextPrototype.fill= arcScaleY * Z;
  xt, x, y, maxWidth) {
    this.drawText_(text, x, y, maxWidth, false);
  };.fillText };

  contextPrototype.strokeText = function(text, x, y, maxWidth) {
    this.drawText_(text, x, y, maxWidth, true);
  };

  contextPrototype.measureText = function(text) {
    if (!this.textMeasureEl_) {
      var s = '<span style="position:absolute;' +
          'top:-20000px;left:0;padding:0;margin:0;borolor2 = stops[len
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//i, overwrit  mr(p.cp1x), ',', mr(p.cp1y), ',',
                       mr(p.cp2x), ',', mr(p.cp2y), ',',
                       mr(p.x), ',', mr(p.y));
          break;
        case 'at':
        case 'wa':
          lineStr.push(' ', p.type, ' ',
                       mr(p.x - this.scaleX_ * p. && obj.s.font;
    } catch (ex) {
        // Ignore failures var_set tovar _div           mr(p.x + this.scaleX_ * p.radius), ',',
                       mr(p.y + this.scaleY_ * p.radius), ' ',
            ll(contexhild(doc.createTextNode(text));
    return {width: this.textMe         }
            }
        }

        /UBS ********/
  var_s, l;
    h = parseFloat(parts[0])     / 360 % 360;
    if (h < 0)
      h++;
    s arcTo = function() {
    // TODO: Implement
  };

  contextPrototype.createPattern = function(image, repetition) {
           }
         ;
        }
        //el.getContext().setCoordsize_()
      }
      return el;
    }
  };

his.y1_ = 0;
    this.r1_ = 0;
    this.colopeat';
        break
      case 'repeat-x':
      case 'repeat-y':
      case 'no-repeat':
        this.repetition_ = repeti    n = +parts[i];
        }
        s[i];
 );
  }

the-doctype)
//   or use Bot2D = CanvasRend�
         * @memberOf ockwise) {
    aR             varRgb(p, q,t2D = CanvasRendtyle(ctx.fillStyle;
                ition;
        break;
      default:
        throwException('SYNTAX_ERR');
    }

    tTION_     maxrc_ = image x:    ];

    setM(this, matrixe lawupdatehan  = image..
   * feng@gmail.com
    G_vmlCanvasManager = falshis.src_ = image x: p.x, y: p  if (obj.filterew DOMException_(s);
  }

  function assertImageIsValid(img) {
    if (!img || img.nodeType != 1 || img.tagName != 'IMG') {
      throwException('TYPE_MISMATCH_ERR');
    }
 owException('INVALID_ST getCoo_ERR');
    }
  }

  function DOMException_(s) {        this.code = this[s];
    this.message = s +': D   }
     ption ' + this.code;
  }
  var p = DOMExceptiultiply(m1, this.m_), true);_SIZE_ERR = 1;
  p.DOMSTRING_SIZE_ERR = 2;
  p.HIERARCHY_REQUEST_ERR = 3;
  p.WRONG_DOCUMENT_ERR = 4;
  p.INVALID_CHARACTER_ERR = 5;
  p.NO_DATA_ALLOWED_ERR = 6
  p.NO_MODIFICATION_ALLOWED_ERR = 7;
  p.NOT_FOUND_ERR = 8;
  p.NOT_SUPPORTED_ERR = 9;
  p.INUSE_ATTRIBUTE_ERR = 10;
  p.INVALID_STATEtiveForEach = ArrayProto.fof (img.readyState != 'complete') {
      thr overwrite) {
            _ERR = 13;
  p.NAMESPACE_ERR = 14;
  p.INVALID_ACCESS_ERR = 15;
  p.VALIDATION_ERR = 16;
  p.TYPE_MISMATCH_ERR = 17;

  // set up externs
  G_vmlCanvasManager = G_vmlCanvasManager_;
  CanvasRenderingNVALID_STATE_ERR');
    }
  }

  function asGradient_;
  CanvasPattern = CanvasPattern_;
  DOMException = DOMException_;
})();

} // if
elmlCanvasManager = false;
}
return G_vmlCanvasManager;
}); // define
;
/**
 * @module zrender/tool/util
 * @author Kener (@Kener-林峰, kener.linfeng@gmail.com)
 *         Yi Shen(hdep/excanvas'],function(require) {

        var ArrayPrar ArrayProto = Array.prototype;
        var nativeForEach = ArrayProto.fo config = {
        /**
         * @namespace module:zrender/config.EVENT
         */
        EVENT : {
            /**
          bject Function]': 1,
            '[object RegExp]': 1,
            '[object Date]': 1,
            '[object Error]': 1,
            '[object CanvasGradient]': 1
        };

        var objToString = Object.prototype.toString;

        function isDom(obj) {
            return obj && obj.nodeType === 1
                 getContext: getContext,
    os;
  var abs = m.abs;
  var sqrt = {
                retContext().
   * @this {HTMLElement}      var result = [];src;
    this.width_ = image.width;
    * @return {At_ = image.heighfals  }

  function throwException(s) {
    th}
  }

  G_vmlCanvasManager_.init();

  // precompute "00" to " 0;
 if the width is less than 1px.
    have hiIZriorit   lineStr.push(
      '<g_vml_:stroke',
      ' opacity="', opacity, '"',
      ' joinstyle="', ctx.lineJoin, '"',
      ' miterlimit="', ctx.miterLimit, '"',
       varownerDocutextBaselfrom the c.lement.eturn obj.filter(cb, ��
         * @param {*} source 源对象
         * @paramvar_oolean} overwrite 是否覆�var_bind(f, obj, var_arSVGRemov
      default:
        tex�，MOUSsee   bisquillSw3.org/TR/2011/REC-SVG11-    0816/or as.html#�，Dataon merge(ta: PfillStylshenyi.914 xStart by 1/80 of a pixel. Use something
 �，/ 2.25;
        break;
    }
ld
 ��
 n:le��数据, 详见 {@link�开优化绑定
             * @type {string}
             */
   lemomas-microsoft-com:offx轴 a cent('onreadystatechange',y y触发，事件对象是 'canvas{display:inline-block;overflow:hidden;' +
          // default size is 300x150 in Gecko and Opera
          'text-align:left;width:300px;height:150px}';
    }
  }

  // Add namespaces and stylesheet at startup.
  addNamespacesAndStylesheet(document);

  var G_vmlCanvasManager_ = {
    init: function(opt_doc) {
      var doc = opt_doc || document;
      // Create a dummy element so that IE will allow canvas elements to be
      // recognized.
      doc.createElement('canvas');
      doc.attachEvent('onreadystatechange', bind(this.init_, this, doc));
    },

    init_: function(doc) {
      // find all canvas elements
      var els = doc.getElementsByTagName('canvas');
      for (var i = 0; i < els.length; i++) {
        this.initElement(els[i]);
      }
    },

    /**
     * Public initializes a canvas element so that it can be used as canvas
     * element from now on. This is called automatically before the page is
     * loaded but if you are creating elements using createElement you need to
     * make sure this is called on the element.
     * @param {HTMLElement} el The canvas element to initialize.
     * @return {HTMLElement} the element that was created.
     */
    initElement: function(el) {
      if (!el.getCont        }
       {HTM= getContext;

        // Add namespaces and styement The element that the 2D contylesheet(el.ownerDocument);

    // Remove fallback content. There is no way to hi// RemovSegme  conwriting, .   * 0 : �      rateLiMgreenDrawing_sv   ];

    s}
   */rkolivegrev    *  2 : + v    控�fixed cor: 'normateLiRatiy: 'Drawing_su, �抛出，调试用
(u2 : 控制台u��出，调r2="    (u2, 'xelRav };

  c
         */Angl             e: 0,

        // retina 屏幕�             d0] ? -ar d1tyle(ctx.fillStyle*colorDatore/
        };x(window.deviccensed un00px;left:0;padding:0;margin:0;�，Mh === nativeForEach) {
 his file except in compliance with the Lic.
// You may obtain a copy of t && isF// Remov.element_.lastChild;
    }
    voc = this.element_.ownerDocument;
censed under th    var attrs = el.attribuil
         * @param {Array} oathR CONDITIONS OF ));
    return {width: this.texath~��拖拽�    var colors = [];
 e === 0) {
        d
// limitations under the L      }
            else if (confierns only support repeat1) {
                for (var k in arguments) {
               y
//   dk infrom the canvas one.
//!(obj && {HTM     resuls width/h].coleight should datall be    ];

    setM(�配� for   * 鼠标按键（手指�his.currentX_ =               v
  c��，�j, a, b)
   *  x    ierCurveTo(thisA9A9A   mes + ' ' + (new/ct
 ed
     ling2][1]);
  }

  funle.tyata + 1);
    var p    + '<brcharpy of the L        cDete��过滤
        'm', 'M

/*l

/*L

/*v

/*V

/*h

/*H

/*z

/*Z          */
    }
)c

/*C

/*q

/*Q

/*t

/*T

/*s

/*S

/*a

/*A',
    darkcyatProp)]
       floralwhite: ' *
 cs.replace(/-/g, ' -xtMeasureEl_ = 0x0907;

        r  turn fnction () {
            return 'zrturn ,nction () {
            return 'z,,);

/**
 * echarts设� darkkhaki: '#BDB70)
               reate pipes so that we can     t],
  ent.];

    setM(this, bas0;=0)';ccp1, cp2, n                      x0907;

         in RegExp(cc[n], 'g'), '|' + to.
  textAlign = elementStyle.dire�提供直a.cole) {
    if (!matarunctcs.互�('|nction () {
    G') {es shis.currentX_ = //     age =ext
     2][1]);
  }

  func *  ierCurveTo(thisG') {
llbar);
      }

      / bas1��图�arr。
 * @author firede[firede@fir(aOffsunctarr[          ' angle="', an  };str.age'At(,
        offset = {= ua.m/);
slice(rocessFontStyle(thistch(/(Andr * @desc thanks zep'e,-

/*defineeuncti, '"',
               (/(Androchs
  **
 * echarts设� 'repeat'�行深�> 0t:
 _DOC
  p.N
    };
    var cp2 = {
 p:
            delta = 1000,
        left = 0,unction bezierCurveTop1, cp2, p) {
    self.currentPath_.p[ilywoparseFloat( &&  slice = Array.prototype.slice;

  /*while
        var i    return;
            }
  isNaN(_DOCto
   * @param {Object} omespaceakbj.filter(cb, context);
            }
           mnctioull || img.tagName != 'IMG') ;
     on setM(ctx, m, upd\/]{0,1}([\d.tlPtX_ = 1;
    this.sc rimtabletos  this.lineScale_ = ctx.m_ = m;
Cmdew DOMException_(s);
  fset = ua.match(/(RIM\sTablet\sOr[\d.]+)/);
        var playbsi || img.tagName != 'IMG') fariOS\/([\d.]+)/);
        vsua.match(/PlayBook/);
     xMExcep= ua.match(/(RIM\sTablet\sOye = uayew DOMException_(s);
  'wronnvert l, H, h, V, '<brv1, mL��形元素移开，�witch (c   ];

    setM(this, matrixMheet'l':of(obj.nodeName) == 'string';
pxacit\s([\d_]+)/);
        var wt';
        bry ie = ua.match(/MSIE\s([\d.]+)/);

        /    v'Lar end = styleS�要进行拷贝的�        b,  1pind(f, obj, a, b)
  .
// * Canvasy = ua.match(/(BlackBerry)eWebKit(?!L*Safari)/) && !chrome;
        var e = ua.match(/MSIE\s([\d.]+)/);

        // Te = ua.match(/MSIE\s([\d.]+)/);

        e) between multiple browsers on android
        // - decide if kindle fire in silk mode m*Safari)/) && !chrome;
        var ie = ua.match(/MSIE\s([\d.]+)/);

        // Todo: clean this up with a better OS/browser seperMtion:
        // - discern (more) between multiple browsers on android
        //   };'ltion:
        // - discern (mor- decide if kindle fire in silk mode Ms android or not
        // - Firefox on Android doesn't specify the Android version
        // - possibly devide in os, rue, os.version = iphone[2].replace(/_/g, '.');
        if (ipad) os.ios = os.ipad = true, os.vation:
        // - discern (mor- decidhone|iPod|iPad).*AppleWebKit(?!h*Safari)/) && !chrome;
        var ie = ua.match(/MSIE\s([\d.]+)/);

        / seperation:
        // - discern (more) between multiple browsers on android
        // - decide if kindle fire in silk mode Hs android or not
        // - Firefox on Android doesn't specify the Android  seperation:
        // - discern (more) between multiple browsers on android
        // - decide if kindle fire in silk mode v*Safari)/) && !chrome;
        va Todo: clean this up with a better OS/browser seperation:
        // - discern (more) between multiple browsers on android
        // - decide if kindle fire in silk mode Vome[1];
        if (firefox) browsewser.version = silk[1];
        if (!silk && os.android && ua.match(/Kindle Fire/)) browser.silk = true;
        if (chrome) browser.chrome = true, browser.version = chC*Safari)/) && !chrome;
        e) between m\s([\d_]+, = ua.matc!ua.match(/Phone/) && tiveForEach = ArrayProto.fo - Firefox on Android doesn't specify the Android version
        // - possibly devide in os, device and browser hashes

        if (browser.webkit = !!webkit) browser.version = webkc          (firefox && ua.match(/Tablet/)) |        '[object CanvasGradient]'var iua.match(/Phowserua.match(/P&& ua.match(/Touch/))));

        return {
            browser: b  function isDom(obj) {
            return obj && obj.no    var ie = ua.match(/MSIE\s([\d.]+)/);

        // Todo: clean this up with a better OS/browser seperCtion:
        // - discern (more) between multiple browsers on android
        // - decide if kindle fire in silk mode S*Safari)/) && !chrome;
        vtos = = ua.match(/MSIE ([\d.]+)/) @author Keneiew) var        (firefox && ua.match(/ook =  *  a[ca�行深度�     pissang (https://www.githpeat'ook = ncat '<br  p.NCLID_ACCESS_ERR = 15;
  p.VALI @author Kener (@Kennctis mo-hub.com/@returs[2
  DOMException = DOMExcepting@gmail.com)
 *    odule:;
  der/mixin/Event3ul
     * @constructor
     */
 on_;
})();

} // if
else {os, device and brtos =,l.com)
Phone/) && ua.match(/Touch/)));
        os.phone  = !!(!os.tablet && !os.ipod && (android || iphone || webos || blackberry || bb10 ||
         nvas').getContext ? true : false
        };
    }

    return detect(navigator.userAgent);
});
/**
 * 事件扩展
 * @module zsender/mixin/Eventful
 * @author Kener (@Ken     * 
 *         pissang (https://www.github.com/pissang)
 */
define('zrender/mixin/Eventful',['require'],function (require) {

    /**
     * 事件分发器
     * @alias module:zrender/mixin/Eventful
     * @constructor
     */
    var Eventful = function () {
        this._handlers = {};
    };
    /**
     * 单次触发绑定，dispatch后�&& ua.match(/Touch/))));

        �毁
     * 
 owser,
            os: os,
            // 原生canvas支持，改极端点了
            // canvasSupported : !(browser.ie && parseFloat(browser.version) < 9)
            canvasSupported : document.createElement('canvas').getContext ? true : false
        };
    }

    return detect(navigator.userAgent);
});
/**
 * 事件扩展
 * @module zQ          (firefox && ua.match(/Tablet/)) || (ie && !ua.match(/ouch/)));
        os.phone  = !!(!os.tablet && !os.ipod && (android || iphone || webos || blackberry || bb10 ||
            (chrome && ua.match(/Android/)) || (chrome && ua.match(/CriOS\/([\d.]+)/)) ||
       q          (firefox && ua.match(/Tablet/)) | return {
            browser: bcanvasSupported : !(browser.ie && parseFloat(browser.version) < 9)
            canvasSupported : document.createElement('canvas').Qtion:
        // - discern (more) between multiple browsers on android
        // - decide if kindle fire in silk mode Teturn this;
        }

        if (!_h[event]) {
            _h[event] = [];
        }

        _h[event].push({
            h : handler,
            one : true,
       Q{

    /**
     * 事件分发器
     * @alias module:zrender/mixin/Event var m1 = [
      [1,or
     */
    var Eventful = function () {
        t;
  DOMException = DOMExcepti  /**
     * 单次触发绑定，{Function} handler 响应函数
     * @param {Object} context
     */
    Eventful.prototype.one       if (_h[event][i]['h'] != handler) {
  �毁
     * 
  ultiple browsers on android
        // - decide if kindle fire in silk mode t            }
                _h[event] = newList;
            }

            if (_h[event] && _h[event].length === 0) {
                delete _h[event];
            }
        }
        else {
            delete _h[event];
        }

        return this;
    };

    /**
     * 事件分发
     * 
     * @param {string} type 事件类型
     */
    Eventful.prototype.dispatch = funewList = [];
                for (var i = 0, l = _h[event].length; i < l; i++) {
                    if (_h[event][i]['h'] != handler) {
  f (argLen > 3) {
                args = Array.prototype.slice.call(args, 1);
            }
A*Safari)/) && !chrome;
        refox on Android doesn't specify the Androidrersion
        // - possibly devide in os, dslue:= ua.match(/MSIE\s([\d.]+)/);

        fes s             break;
                }
  \/([\s([\d_]+)/    pissang (https://www.githie = ua. azu *         pissang (https://www.githirefox on Andro      ject} context
     */
    Eventful.prototype.oneAtion:
        // - discern (more) bet
//   Quitch(/Mot(m[0  */
    Eventful.prototype.bind =   azureultiple 元�, fs, rx, r
   si�极端点了
            // canvasSupported : !(browser.ie - decide if kindle fire in silk mode a                // have more than 2 given arguments
                        _h[i]['h'].apply(_h[i]['ctx'], args);
                        break;
                }
                
                if (_h[i]['one']) {
                    _h.splice(i, 1);
                    len--;
                }
       ie = ua.match(/MSIE\s([\d.]+)/);

        // Todo: clean this up with a better OS/browser seper      }
        }

        return this;
    };

    /**
     * 带有context的事件分发, 最后一个参数是事件回调的context
     * @param {string} type 事件类型
     */
    Eventful.prototype.dispatch2;
  p.INVALID_MODIFICA).innerHT变�ar Z = 10;
  var_;
  CanvasRendj        }
       // transjngContj    
    canvasElement.appendtch(/Table[j]    ner-林峰, kener.linfeng@g        aLeft          pissang (https://on_;
})();

} // if
elca       in writ 0 : �n m1;
  }

  var processStymd    cctor
   used as the initial
  +)/);
        var webos = ua.match(/(wbluevquire)z3.0 *       Z
    };
    var cp2 = {
     default:
            @aut[  };

  contextProtothen the functionentStyle.direction ==ar firefox  String(styl

    /**
   eight should    azure: '#F0FF是事件回调的cDds(tlor stops in ascen            , '"ateMatr / 180.,
        offsetvar i= uarkmagtorepsi2, '"xops x2iceP2. current matrix so that+
      in // 对�yops y�通过 s.push(stop.offsety= ua-1./config    * @event�可以通过 onxxxx 绑定事件
    /**
     // 对� module:zrender/  var stop = stopsambdes s(xp * xpicePirn: 'rxfill(y   *y@type {F',
rind(      return funcouseove>
    ];

    setM(this{Fun   };

vegreouseov;
                ifyEventful#onmouseout
     * @type {F        _h.spli    v    };

vegre(( {Function*ault null
��极端点了
       - mixin/Eventful    * @dmove
     * @type {Functiont null
nctio   * @t)icePion}
     * @default n
      stops.sort(functi @event module:zrendering}
             *      return func    == f/licenses/LICENSE }
  Even-1 || img.tagNam: getContext,
ch(/Silk\/fto
   * @param {Objecmoduer/mixin/Eventf /**
     * @event c;
   functi  * @ /hrome\/([\d.]+)/)G') {nclicful#- @evexeup
 '"',
           ixin/Eer
  dth     * @default null
     */
    /**
     * @eventcx    var opa* @type {Funct  * @type {FunctcyMISMATCH_ERR');nctioner
 ebriule:zrende
      stops.sort(functdefault null
     @type {Function}
     #ondragstart
     * */

    /**
     * @thetes selRati([ngCo0 efaudule:- {FuiceP�回defa-   /ter
 ye);
      var colG') uData #ondragenter
     * @type {Functio,
      // otherwisull
  k
   ondragenter
     k
     * @event module:zrender/mixin/EvdTule:zrender/mie: 0,*
     * @event modnction (requ <sedo is used, the meaning*/
    /ateMatrix
     * @type {Function}
     /mixin/Eventf>=
    ];

    setM(thise {Functi     * @event mod    * @event modus (fillS&&/Eventfu;
        var silk = uae {Functie {Func      on}
     * @default null
     */
    /*   * @d1fault null
<    */
    
    return Eventful;
});

+**
 * 事件辅助类
 * @module zrenderocument. cnt])y件回调�dule:,l;
});
�的c�事ule:zrender/ String(stylcensed under thFigure  and height attte have higher priority than the
//   width and h = function(image, repetition) { in arguments)  mode isn't impl && isFinits width/height should is using content-box by det. IE in
//   * @ra#A9A9A9',
    dar          
    //ent_ = el;
    this.scaleX   mes + ' ' + (newaleY_ = 1;
       mes               ��手指�    };��（手指�    };||ntext2D_(this))].col(指� debug
    }
    ctx.m_ =                || typeof e��x坐标.
       rds(this, aX, aY);
    this.currentPath_.push({ty'lineTo', x: p.x, y: p.y});

    this.currentX_ = tion Cagle{
          his.currentX_ =                   }
 defined'vasRenderingContext2D_;
  CanvasGradienpeat'defined'[i]tion (re.toUpperCase() 3);
M
    };
    var cp2 = {
 * 提取鼠标y      var ip= null || p.y > max.y) {
    this.curre* 提取鼠标yobj.filter(cb, context)* 提取鼠标y坐标
        * @mtext: getContext,
    pod = ua      * @retu                    }
                  k          break;
k                   case 3:
           function g      p[jCUMENgs[2])d/);
        var kindle = ua.matchtype {Function      function getY(e) {
  of e.zrenderY != 'undefined' && e.zrenderY
     
        * @memberOf module:zrender/tool/event
        * @param  {Event} e 事件([\d.]+)      * @return {nume, '"',
                           || typeof e.layerY != 'undefa.match(/(iPhone|iPod|iPad).*Appl mode is android or not
        //push({
     DOCUMENT_tiveForEach = ArrayProto.fo- decide if kindle fire in  os.ipod = true, os.version = ipod}

  functio     || typeof e.wheelDelta != 'undefined' && e.wheelDelta
                     (firefox && ua.ma
    if (!aFill) {ed' && -e.UMEN2l/eve3l/eve4l/eve5typeof e.wheelDelta != 'undefined' && e.wheelDelta
            /**
     * 解绑事件
  dStroke(ctx, lineStr)ender/tool/event
     ypeof e.wheelDelta != 'undefined' && e.wheelDelta
                           // have mor**
     *ed'      pissang (https://www. * @eventENT_       e.cancelBubble = true;
an 2 g[his.code = this[s];
    this(/Chro     3    }
            : function (edule:zre  *            e.returnValue = fale {Functietho           e.returnValue = fal       [6   getX : getX,
            getne']) [7    }
            : function (e)er
 r heint m?e) {:hrome\/([\d.]+)/) || ua.mtion(aOff2, 0
   做向上兼ar drC',
           Dispatcher : Eventful
    le =做向上兼�arks容
 1 (bb10) os.bb10 = true, os.vtxExampl
    uire',
            DBLCLICK : 'dblclirot     si
            DBLCLICK : 'dblcli  righ
     ,nction 
            DBLCLICK : 'dblcliarc(  br, rn/Eventfudule:z+ul'],funcops ferDocument;
          * @typedef {Floa1 /l
     �类       y.<number>} Vector2
         */
32Array-;

        /**
         * @typedefefined'
  -uire-      ? Array
            : Ffined' && e.wheelDelta
          z   var stop = typeof window.addar ms = m.sin;
  var mc = m.c   * @param {number} [y=0]
    {
                    _h.splice(i, ire) {

        

        var Eventfureate them imberif the width is less than 1p�手指）x坐标
        * @memberOf module:zrender/tool/event
d.]+)?/)[1];

  /**
   * This funtion is assigned to the <ca && isFinitlement.getContext().
   * @this {HTMLElem
   * @return {CanvasRenderingContex//10
    family: '微软雅黑'     //'sans于Canvas，纯Javasc
                    me    y: this.currentY_ + 2.0 / 3.0 * (cp.y - this.currentY_)
    };
    var cp2 =str += decToHex[clamp(n, 0, 255)];
      }
   type {Function,
    deeppink: '#FF149 };

    bezierCurveTo(this /**
     * @event />'
                result = {};
                                     result[ke                if (source.hasOwnProperty)) {
                            result[ke    */
        function getX(e) {
            return typeof e.zrenderX != 'undefined' && e.zrendet. IE in            || typeof e.offsetX != 'undefined' rX
       tX
            unction bezierCurveTor/tool/event
     

  contextPrototype.rotate            || typeof e..layerY != 'undefined' && e.layreak;
                    return result;
      j    aCP2x,   ];

    setM(this, matrixpeat'      x      return source;
        }

   
        fun[j   getX : getX,
           on_;
})();

} // if
else {      * @paranProperty(key)) {
                    var targ} v1
             * @param {Vector2} v2
           , m22, dx, dy) {
    var m1 = [
      [m11, m12, 0],
       * @pay               && !BUILTIN_OBJECT[oCT[objToStri} v1
             * @param {Vector2} v2
             */
          y        && !isDom(targetProp)
                 out[0] = v1[0] + v2[0];
                out[1] = v1[f (_h[i]['one']) {
                    _h.splifset *n getContext() {
   />'
  =  var out = new Ar    pissang (http|| var ta* a;
       key in   out[1] = v1[1] + v2jToSt* a;
                out[1] = v1[1] + v2[1  },

                 return out;
        copy: functionrts[3];
    } else if (/^hsl/.tquotntent(styleString);
    * @param {Vector2} v2
 str = c * @param {Vector2} v2
tr, alphar/mixin/Eventful#o: 'normal',
       * @return {Vector2}
             te为true，或者在目标对象中没有此属性的情况
                    target[key] = source[key];
                }
            }
        }

        /**
         * 合并源对象的属性到目标对象
         * @memberOf module:zrender/tool/util
  变化
        pha = +parts[3     out[0] = v1[0      varn getContextcaleAny
//   d*} source 源对象
         * @pa& e.oound this
  是否茇）', 'moveTo':
          c = loaassiEffect/B* the WHATWG.
    mr(p.x), ',', mr(p.y遍历
     casv[1];
ion 2.gneda提� skyblue: '#87CEEB',
    slateblue: '#6A5ACD',
    slategray: '#708090',
 new s so we
        // jnew fu{
    this.m_ zrL');
s so we
        // j                * @pa      /**-micrs so we
                   /**
event module//www.apaBarstChild;
    }
    var doc = this.element_.ownerDocument;
caleAndAddnew e
        /on't renderogle Inc.
//
// Licensed under th进�);
 �:none;' +
  :none;' +
          'white-smas-micrH   [m:none;' +
          'white-srefresh{Vector2} v1
    cense at
/Bolute';
    ._fset, aC//www.apac @param {Vecto,m {Vector2} v2eige: '#F5F5DC',
   [];��s call� canfunction getX(e) n a cop =      mergntext) == nativeFilter) n a cop* @param {Vector2}new CanvasRenderingContex 'urn: mp;')ar stop = typeof window. {Veclush888',
    darkcyan: '#008}* @param {Vector2} v2
backgstartm {Vec    gba(250,           0.8)r errorrik (errorriurn {     O a co    * @param {Vector2} v1
        * @param {Vector2} v2
ng);
   e lawcher pHr, alp/aCP1x3;
            },

          str = c**
        RgbHslContent(styleString);) {
         atchx=0]
             * @paracurrentY:entY_)
  * @param {number} s
    timeI thivalCtor0r/mixin/Eventful#ondracaleAndAdd: function (out, v1, vevent module:zre= tru     (out, **
   供�T    retuche.org/dexOfe LictX
                mber}
    rn out;
      Bber}
      },

        mber}
         [1] * s;
                    retu=];
     .         ret      /**
         ��始化动画元素          * 向量�r return  thankfunction (ou}

 out, v1, v2) {
 rns only supp :      s.m_),         retnull
     */
       @return {numb);
   .        out[0].      =    var m1 = [
           ret        out[1] = v1[1] + vram {Ve���calearGradi                 // have  = v[0] / d;
eCache = {};

  functio = v[0] / d;
ent, handler, context)  return out;
  +�间距离
    str            },

            /**
              * @paratr, al  * @param {number} s
[ [  /*'#ff6400'entful0.5     *e1         1    b1ff      _ERR = 4;
  p.INVAevent module:zrender        progressft =tMeasureEl_.removeNode(t//tyle定      0) {
             @param {Vecto(mber}
                   _h.sp               else {
   str =            out[0]eFilter) adjust               (v     �类]heel
     * @type {Fun*            normalize           pissang (https://         + (v1[1] - v2[1]) * (v1[1);
   +)/);
        var w - v2[1]) * (v1     retu
      x: p.x,
      yVector2} v2.sin;
  var mc = m.cos;
  var abs = m.abs   * @return {Vector2}
             
  c��环显示                );
            },

            /zierCurveTo(this, cp}
   */
et s) {
    */
    Eventful.prot//www.apac   ];

    setM(this, matrix - v2[1]) * (v1[1] - v2[1])
                )] = v1[0] + ;
            },

            <       * @param {Ve       * @param {Vector2} v2
   ;
            },

            += 81
             * @param {Vector2} v2
             */r m1 = [
      [m11, m12, 0],
           * 求负向量
             * @param {Vector2param {Vector2} v2
             */    */
            distanceSquare: functio function (v1, v2) {
              
                        v2[0]) * (v1[0] - v2[0])
       
             * @return {nu = v[0] / d;
, v, s) {
  ring}
             */
           n is called
   * @returotationter clockwise    lenSquare: function (v) {
       ubbleStr.push(' m ', mr(p.x), ',', mr(p.y[1];
            },

      Circ**
             * 向量乘法
             * @param {Vector2} out
             * @param {Vector2} v1
             * @param {Vector2} v2
             */
            mulram {V return v1, v2) {
        ram {Vet[0] = v1[0] * v2[0];
�左�              out[1] = v1[1] * v2[1];
                return out;
            },

 �左�         /**
     censed under th泡�    * @param{Vector2} out
             * @param {Vector2} v1
             * @param {Vector2} v2
             */
     �左�     div: function (out, v1, v2) {
                out[0] = v1[0] / v2[0];
[0] / v2[0];
                out[1] = v1[1] / v2[1];
                return out;
            },

            /**
             * 向量点乘
             * @param {Vector2} v1
             * @param {Vector2} v2
             * @return {number}
             */
            dot: function (v1, v2) {
                 * @param {Vector2} v1
   turnsplit
        };
    }
);

demp(n, 0, :vior from WebFX
//   (ht             */
 2.0 / 3, v2) {
                ou         random       scale: function (out, v, s) {
                out[0] = v[0] * s;
                out[1] = v[1] * s;
                return out;
            },

            /**
             * 向量归一化
             * @param {Vector2} out
             * @param {Vector2} v
             */
            nor  darkkhaki: '#BDB7 =         out[1ript图表库０�量.currentY_         out[1defined'
s.push(stop.offsetstr += decTo = v[0] / d;

          ill type="', fillSon 2    }

        /**
        t
         rn out;
 
         zrender/tool/matrix
         * /
        var     *nt} e 事件.
        * @re, v) {
                var d = vectorarkslateblue: '#483D8ction (out, a, b) {
                ] = v[0] / d;
      3);
  retur v2) {
              ?1] = v[1]lemen(] = v[1]  retuelse0.Style(ctx.fillStyleeTo =  = v[0] / d;
                 out[1]    * @exp&& ua. in [1];
      = 0) {
                        out[0] =  v1[0] * v2[0] + v1[1] * v2[1]**
   eil   }
 
           
         browser,
            os: os
      st          */
            id     *browser,
            os: os         out[0] = 1;
         40browser,
            os: os         */
s that wil* @param {Vector2} v1
                Cache = {};

  function proct#VML');
urn out;
            },
          t[0] = Math.= aY + ms(aStartAngle) * a
             * @return {nuanim    nY] = 0;
                out[3]20null
     */
    /', 'u  lineStr.push('<g_vml_:fill type="', } out
             * @param {Vector2             */
            negate - v2[1]) * (v1[1] - v2[1])
         * @return {number}
         ber>}
             */
            create : functiofunction(aOffs[0] =/**
                else {
               _h.splice(i, 
   * @ret;
        },
    m {Float32ASizing Brful#       * 向量相加
          /**
                else {
       /**
        ay.<numbe     pissang (https://www.gith2Array|Array.<number>} m1
  ','), '"'             '[object CanvasGradient]'     */
            identit  function isDom(obj) {
            return obj && obj.nodeType === 1
             2Array|Array.<number>} m1
    -/**
             * 向        out[2] = m1[0m {Float32              _h.splice(i,  - v2[1]) * (v1@param {Floa 11;
  p.SYNTAX_ERR = 12;
  p.INVALID_MODIFICAr ax = v1[0];
                // var ay = v1[1]              out[0] = v1[0] + t           * @return        out[1] = v1[1] + t * (v2[1] - restgreen: '#2cientific notatio�左�            
            /**
             * 矩�Dynamic#2E8B57',
    seashell: '#FF@param {Vector2} out
             * @paneyde             * 向量乘法
             * @param {Vector2} out
             * @param {Vector2} v1
             * @param {Vector2} v2
             */
            mull: '# (out, v1, v2) {
        neydew: ] = v1[0] * v2[0];ray.<number              out[1] = v1[1] * v2[1];
                return out;
            },

ray.<number         /   

        var Eventful��态   y: Z * (aX *{Vector2} out
             * @param {Vector2} v1
             * @param {Vector2} v2
             */
    ray.<number     div: function (out, v1, v2) {
                out[0] = v1[0] / v2[0];
                out[1] = v1[1] / v2[1];
                return out;
            },

            /**
             * 向量点乘
             * @param {Vector2} v1
             fffparam {Vector2} v2
             * @return {number}
             */
      /*t: function (v1, v2) {
                return v1[0] * v2[0] + v1[1] * vturn缩放
             * @paramt[0] = Math. {
      appendFill(this, l           return out;
            }
        };

        vector.length = vector.len;
        vector.lengthSquare = vector.lenSquare;
        vector.dist = vector.distance;
        vector.distSquare = vector.distanceSquare;
        
        return vector;
    }
);

define(
    'zrender/tool/matrix',[],function () malize: 
        var ArrayCtor = typeof Float32Array === 'unray;
        /**
         * 3x2矩阵操作类
         * @exports zrender/tool/matrix
         */
        var matrix = {
            /**
             * 创建一个单位矩阵
             * @return {Float32Array|Array.<number>}
             */
            create : function() 
    this-     out[0] = 1;
         100,
        offset = {xe:zrender/tool               out[3] = = a[5] * vy;
           ' col     out[0] = 1;
                out[1]+)/);
        var ipod {
                var out = new ArrayCtor(6);
                matrix.
       [3] = m[3];
         eturn out;
                           // 否则只处理*
             * �[3] = a[3为单位矩阵
             * @param {Float32Array|Array.<number>}ring] :tY_ = p.: function(out) {
         a[1];
 po         /**
      h and height;
       th * a         var ad = a[3];
              var aty = a[5];

         /**
             * 复制矩阵
             * @param {Float32Array|Array.<number>} out
             * @param {Float3X] = 0;
                out[3]10= 1;
                out              */
            copy: function(out, m) {
                out[0] = m[0];
                out[1] = m[1;
                out[2] = m[2];
                out[3] = m[3];
                out[4] = m[4];
                out[5] = m[5];
                return out;
            },
            /**
             * 矩阵相乘
           = a[1];>        entityt
             * @param {Float32Array|Array.<number>} m2
             */
      return out;
            },
            /**
      function processStyle(sa[4]40* @param {number} t
       ;
    var opac�发一ram ��次
// 目前32Array|Array.<number>} m2
      }

  var D* 求逆矩阵
             * @param {Floattps://github.com/pissang)
 */
defi     = 1;
    
    1
             * @param {Vecache = {};

  function processStyle(s�点@param {Float32Array|AXfunction (require) {

    er',['requi  var eventTool = require('. * m2[3];
                out[4] = m1[0] * m2[4] + m1[2] * m2[5] + m1[4];
                out[5] = m1[1] * m2[4] + m1[3] * m2[5] + m1[5];
                return out;
            },
            /**
             * 平移变换
             * @param {Float32Array|Arraray.<number            
            /**
             * 矩�Ring       return v[0] * v[0] + v[1] * v[1];
            },

            {
        Simension = m.max(width, height);
              * @param {Vector2} out
             * @param {Vector2} v1
             * @param {Vector2} v2
             */
            mul:ing= a[3];
                ou   va          * @paElemen= a[3];
                ouElement= a[4] + v[0];
      vent              out[1] = v1[1] * v2[1];
                return out;
            },

vent* 旋转变换
             * @para��环32Array|Array.<number>} out
             * @param {Float32Array|Array.<number>} a
             * @param {number} radvent} v2
             */
            min: function (out, v1, v2) {
                out[0] = Math.min(v1[0], v2[0]);
                out[1] = Math.min(v1[1], v2[1]);
                return out;
            },
            /**
             * 求两个向量最大值
    07els[   * @param  {Vector2} out
             * @param  {Vector2} v1
             * @param  {Vector2} v2
             */
            max: function (o��
 2} out
         reateElement('canvas').get       /**
             * 向 = 0;
                out[22y,
61, v2) {
                ou    '&quot st;
                out[3] = -a#bbdcffth.max(v1[1], v2[1]);
     aces[prefix]           scale: function (out,xOf('(', 3);Stylhat st(event)) {
                    < e
   normal 30tElement(el(event)) {
                            */
  3para44    5    6ction (v1, v2) {
       (out, v, s) {
                out[0] = v[0] * s;
                out[1] = v[1] * s;
           /tool/matrix',[],function () {
 * s;
                
                  /**
  out[0] = v1[0] +          l : 0] - v2[0]) * (v1[0] - v2[��click事件�间距离
      * @default null
     */
    /*��click事y��
                    if (this._clickvent  * @param {Vector            }
r./co           }

通� - 5      lineStr.push('<g_vml_:fill type="', fill     return out;
            },

            /**
             * 向量归一化
             * @param {Vector2} out
             * @param {Vector2} v
  Threshold < 5) {
               aleY_ =      /**
     s.push(stop.offset sRen           }

    6s.push(stop.offset           return; -              }

   {
                var out @default null
     arkm {Vecto] = v[1]l     out;
 0.roce�操作类
         * vent        ent || w= 0) {
                    out[0] = 0;
                    out[1] = 0;
                }
 , v) {
                var d = vector.len   * @exports zrender/tool/matrixlolr x: p.x] = v[1] /         L');
sout, m1, m2) {
   [    */
   distance: f    97v2) {
     '#FF8C00',
    darkorchid: 'm_ = m;lRatio |1t,
      // otherwiendlRatio |24ned' && e.zrendearkslateblue: '#483D16ction (out, a, b) {
     nfig','./  default:��先~
    为单位矩阵
             * @param  {Float32Array|Array.<number>} oueCache = {};

  function pr};

ent, handler, context) {
  P2y,
      * @param {Event} event
   ;
            },
            artlRatio:y(_lastHovon ()lRati       */
            clic(_lastHovnction (ev  * @param {number} s
             rElement(event)) {
                       ntFixed(e    this._isMouseDown = 0;
                
_        ] = v[1] / d;
                }
               ESIZE,+     * 事�toreent)) {
 ERR =      * 鼠标滚轮响应函- // https:/    eloper.mozilla.org/en-US/docs/DOM/DOM_eve    // https://developer.ment) {
     zilla.org/en-US/docs/DOM/DOM_event_reference/mousewheel
                        || -event.detail; // F          //' size="',blclick事e);
        
            * @return {*} 拷贝后的ion (
              s[2]);_ERR = 4;
  p.INVALID_CHAR_ERR = 4;
  p.INVALID_      */
           ,function (require)     var s=t) {
    2} v
             * @return {_lastHover36r);
      }

      // When crCurveT4      }
                }

                this._mousemoveHandler(event);
            },
            

            /**
             * 鼠标滚轮响应函数
             * @inner
             * @param {Event} event
             */
            mousewheel: function (event) {
                if (! isZRenderElement(event)) {
                    return;
                }

                event = this._zrenderEventFixed(event);

                // http://www.sitepoint.com/html5-javascript-mouse-wheel/
                // https://developer.mozilla.org/en-US/docs/DOM/DOM_event_reference/mousewheel
                var delta = event.wheelDelta // Webkit
                            || -event.detail; // Firefox
                var scale = delta > 0 ? 1.1 : 1 / 1.1;

                var needsRefresh = false;

               + 3   var mouseX = this._mouseX;
                var mouseY 33 this._mouseY;
                this.painter.eachBuildinLayer(function (layer) {
                    var pos = layer.position;        * @param {Floer/mixin/Eventf                  (v1[0] - v2[0]) * (v1[0] - v2[0])
                    + (v1[1] - v2[1]) * (v1[1] - v2[1])
                )ayCt量距离平方
             * @param {.toFixed(2       ',
                  }

              else {
   licetion(a5 + '%tion:
        // -  out[4] = m1[0] * m2    oat32Array|Array.<nuarkslateblue: '#483D2rCur                          2Array|Array.<number>} m1
  {
      483D8current matrix so that savenfig','./toolwww.sitepntFixed(efunction (require) {

 out[4] = m1[0] * m2[4] + m1[2] * m2[5] + m1[4 var env = require(r ax = v1[0];
                // var ay = v v2[0]) * (v1[0] - v2[0])
                    + (v1[1] astHover.clickabl },

            /**
   ty - ad * atx) * det;
                out[5] = (ab * atx - aa * aty) * det;
                returm1, this.m_), false);
requn
 * 2, aC-22y,
r = typeof Float32Array //        /**
             * 鼠标（手指）移动响应函敇�数
             * @inner
             * @paraparam {Event} event
             */
            mousemosemove: function (event) {
                if (! isZRenderElement(evenevent)) {
                    return;
                }

       out[4] = m1[0] * m2[4] + m1[2] * m2[5] + m1[4];
                out[5] = m1[1] * m2[4] + m1[3] * m2[5] + m1[5];
                return out;
            },
            /**
             * 平移变换
             * @param {Float32Array|Arra                
            /**
             * 矩�Spixt = function(text, x, y,@param {Vector2} out
            d stylesheet toRenderElement = function (event) {
            // 暂时忽略 IE8-
            if (window.G_vmlCanvasManager) {
                return true;
            }

            event = ezrAodes so we
        // just remo��入对象优先~
            var target = event.toElement
            !thi              out[1] = v1[1] * v2[1];
                return out;
            },

!thi            /**
             * 求��转32Array|Array.<number>} out
             * @param {Float32Array|Array.<number>} a
             * @param {number} rad!thi     div: function (out, v1, v2) {
                out[0] = v1[0] / v2[0];
2];
                var atx = a[4];
                var ab = a[1];
                var ad = a[3];
                var aty = a[5];
                (event)) {
                    Thisut[1] athsvar st = Math.sin(rad);
                var ct = Math.cos(rad);

                o* s;
                out[1] = v[1]  },
            
            /**
             * 双击响应函数
             draggingTarget.modSelGa    1er/mixin/Eventful#o         */
      ���    args out, m1, m2) {
        retu*
             * 鼠,shold++;
                }
    < eckThreshold < 5) {
                          
                  *  this._clickThreshold++;
                }
                else if (this._isMouseDown) {
                    [0] / v2[0];
                out[1] = v1[1] / v2[1]           */
          return out;
            },

        nor + v{          * @return * @param {Vector2} v1     9       */
            
       * @param {number} s
f (t18       */
            �的图形元素最后addHover
     , v, s) {
                out[0] =           this._draggingTarge.<number>} v
     ocloat3EEL, eve / d  layer  this._clickThresh  cursor = '                */
        �click事�+                       thorm scaling does not c(fillStylsh) {
              needsRefre
            i._draggingTarge间距离
     =    layer           * @para;
              * @param {Vect=shold++;
                }raggdraggingTctordraggingTtr, alpoveTo', x: p.x, yhold++;
                }Threshold < 5) {
 fresh) {
          (needsRetrue;
                         �归一化
             * @param {Vector2} out
             * @par
        var ArrayCtor = typeof Float32Array === 'untion (event) {
                if (! isZRenderElement(event)) {
                    return;
            }

                eventvent || window.event;
                event = astHover.clickable)
                    || !_lastHover
                ) {

                     ockwise) {
18;
   chocolate: '#D2}
             */
            create : functio= a[0];
           his._mousemoveHandler(event);
            },
            

            /**
             * 鼠标滚轮响应函数
             * @inner
             * @param {Event} event
             */
            mousewheel: func         *                  if (! isZRenderElement(evd(event);

       br {
                if (! isZRendeww.sitepoint.comidenti       totype.s                        return;
                       out[0] = v[0] * s;
             ull
     */
    /**
     * @event  ' collse;
    ule:;
                this._lastY = this._mouseY;
                this._mouseX = eventTool.getX(event);
          ['h'].call(ctx, args[1 ret   v0.tion(aX, aY) {
    [4];
                out[5] = m[5];
                returnnfig','./tool32Arryer.dip) {
    this
                out[4] = m1[0] * m2[4] + m1[2] * m2[5] + m1[4];
                out[5] = m1[1] * m2[4] + m1[3] * m2[5] + m1[5];
                return out;
            },
            /**
             * 平移变换
             * @param {Float32Array|Arra!thi            
            /**
             * 矩�Whirl           'touchstart', 'touchend', 'touchmove'
的mouseout和dr   var isZRendertContext      * @param {Vector2} v
             * @param {Vector2} m
             */
            applyTransform: function (out, v, m) {
                         // 可能出现config.EVENT.vent || window.event;
            // 进入对象�g_o_', ' (out, v1, v2) {
        tmlAttribute  var y = v[1];
                out[0] = m[0] * x + m[2] * y + m[4];
                        out[1] = v1[1] * v2[1];
                return out;
            },

                    this._processDragLeave(evenheight32Array|Array.<number>} out
             * @param {Float32Array|Array.<number>} a
             * @param {number} rad                        this.painter.clearHover();
                }

                // set cursor for root element
                var cursor = 'default';

                // 如果存在拖拽中元素，被拖拽的图形* @p��最后addHover
                if (this._draggingTarget) {
                    this.storage.drift(this._draggin          dot: funct, dy);
                    this._draggingTarget.modSelf();
                    this.storage.addHover(this._draggingTarget);

                    // 拖拽不触发click事件
                    this._clickThreshold++;
                }
                else if (this._isMouseDown) {
                    var needsRefresh = false;
                    // Layer dragging
                    this.painter.eachBuildinLayer(function (layer) {
                        if (layer.panable) {
                            // PENDNG
                            cursor = 'move';
                            // Keep the mouse sition[0] += dx;
               If (th�元素最后addHover
          Outhis.#555             // 分发config          6c      layer.position[1] += dy;
        5                  needsRefresh = true;
                            layer.dirty = true;
                        }
                    });
                    if (needsRefresh) {
                        this.painter.refresh();
                    }
                }

                if (this._draggingTarget || (this._hasfound && this._lastHover.draggable)) {
                    cursor = 'move';
                }
                else if (this._hasfound && this._lastHover.clickable) {
                    cursor = 'pointer';
                }
                this.root.style.cursor = cursor;

          , v) {
                var d = vector.lene
     urn String(s).           var _lastHover = this._lastHov               out[2] =aClockwise) {
sh) {
            aStartAngle, aEndAngle,b            /**
             -esh) {
         / 6ouch移动响应函数
         */
            scale: function          = v[0] / d;
          **
        * 提取鼠标滚轮�or;

              cam {VIr.di * 设置矩阵为单位矩阵
   ousedownHandler(event);
            },
2] = 0;
     /**
             * t} event
             */
            touchmove: function (event) {
                if (! iI          out[3] =  {
                    return;
        .EVE�件
                var _lastHover = this._lastHov     // Keep the mouse cent         * @inner
             * @param {Even"', fillStyle.src_, '" /               if;
            },
      
            touchmove: function (event) {
                if (! iOueption(s) {
    th�默认事件，釵�的mouseOut
               return out;
  s._lastHover.dra     if (elemente
      if (this._hasfou        return;
 =            event = this._zrenderEventFixed(event, Ou    event = this._zrenderEventFixed(e         }
                   event = this. used as the initi(event, true);
           (now - this._lastTouchMomeevent);
           (now - this._lastTou    _vml  if (element == this.root) {
                            this._mousemoveHandler(event);
                            return;
      - v2[1]) * (v1                   return;
                        }

                                 }

                event - v2[1]) * (v1e
     elay / 2) {
                        this._dbIar elementStyle = this.e m1[1] * m2[4] + m1[3] * m2[5] + m1[5];
                return out;
            },
            /**
             * 平移变换
             * @param {Float32Array|Arra        bind(f, obj