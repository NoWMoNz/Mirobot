/**
 * Vector Font & G-Code Generator for MiRobot
 * Converts mathematical characters and formulas into vector strokes and G-code.
 */

// Hershey-style simplified stroke font definition
// Grid unit: 0 to 10 for X, 0 to 16 for Y (0,0 top-left)
export const FONT_GLYPHS = {
  " ": [],
  "0": [
    [[2, 2], [8, 2], [8, 14], [2, 14], [2, 2]],
    [[8, 2], [2, 14]] // slash inside zero
  ],
  "1": [
    [[3, 4], [5, 2], [5, 14]],
    [[2, 14], [8, 14]]
  ],
  "2": [
    [[2, 4], [3, 2], [7, 2], [8, 4], [8, 7], [2, 14], [8, 14]]
  ],
  "3": [
    [[2, 3], [3, 2], [7, 2], [8, 4], [5, 8], [8, 11], [7, 14], [3, 14], [2, 13]]
  ],
  "4": [
    [[7, 14], [7, 2], [1, 9], [9, 9]]
  ],
  "5": [
    [[8, 2], [2, 2], [2, 7], [7, 7], [8, 10], [7, 14], [3, 14], [2, 13]]
  ],
  "6": [
    [[7, 3], [4, 2], [2, 6], [2, 12], [4, 14], [7, 14], [8, 11], [8, 8], [4, 8], [2, 11]]
  ],
  "7": [
    [[1, 2], [9, 2], [4, 14]]
  ],
  "8": [
    [[5, 8], [3, 6], [3, 4], [5, 2], [7, 4], [7, 6], [5, 8], [3, 10], [3, 12], [5, 14], [7, 12], [7, 10], [5, 8]]
  ],
  "9": [
    [[8, 8], [6, 8], [2, 8], [2, 5], [4, 2], [7, 2], [8, 5], [8, 12], [6, 14], [3, 14]]
  ],
  "+": [
    [[5, 4], [5, 12]],
    [[1, 8], [9, 8]]
  ],
  "-": [
    [[2, 8], [8, 8]]
  ],
  "−": [
    [[2, 8], [8, 8]]
  ],
  "*": [
    [[2, 4], [8, 12]],
    [[8, 4], [2, 12]],
    [[5, 3], [5, 13]]
  ],
  "×": [
    [[2, 4], [8, 12]],
    [[8, 4], [2, 12]]
  ],
  "/": [
    [[2, 14], [8, 2]]
  ],
  "÷": [
    [[2, 8], [8, 8]],
    [[5, 4], [5, 4.5]],
    [[5, 11.5], [5, 12]]
  ],
  "=": [
    [[2, 6], [8, 6]],
    [[2, 10], [8, 10]]
  ],
  ".": [
    [[4.5, 13], [5.5, 13], [5.5, 14], [4.5, 14], [4.5, 13]]
  ],
  ",": [
    [[5, 12], [5, 14], [3, 16]]
  ],
  "(": [
    [[7, 1], [4, 5], [4, 11], [7, 15]]
  ],
  ")": [
    [[3, 1], [6, 5], [6, 11], [3, 15]]
  ],
  "^": [
    [[2, 7], [5, 3], [8, 7]]
  ],
  ":": [
    [[5, 5], [5, 6]],
    [[5, 11], [5, 12]]
  ],
  "A": [
    [[1, 14], [5, 2], [9, 14]],
    [[3, 9], [7, 9]]
  ],
  "B": [
    [[2, 14], [2, 2], [7, 2], [8, 5], [6, 8], [2, 8]],
    [[6, 8], [8, 11], [7, 14], [2, 14]]
  ],
  "C": [
    [[8, 4], [6, 2], [3, 2], [2, 6], [2, 10], [3, 14], [6, 14], [8, 12]]
  ],
  "D": [
    [[2, 14], [2, 2], [6, 2], [8, 6], [8, 10], [6, 14], [2, 14]]
  ],
  "E": [
    [[8, 2], [2, 2], [2, 14], [8, 14]],
    [[2, 8], [6, 8]]
  ],
  "F": [
    [[8, 2], [2, 2], [2, 14]],
    [[2, 8], [6, 8]]
  ],
  "G": [
    [[8, 4], [6, 2], [3, 2], [2, 6], [2, 10], [3, 14], [7, 14], [8, 10], [5, 10]]
  ],
  "L": [
    [[2, 2], [2, 14], [8, 14]]
  ],
  "M": [
    [[2, 14], [2, 2], [5, 8], [8, 2], [8, 14]]
  ],
  "N": [
    [[2, 14], [2, 2], [8, 14], [8, 2]]
  ],
  "P": [
    [[2, 14], [2, 2], [7, 2], [8, 5], [7, 8], [2, 8]]
  ],
  "R": [
    [[2, 14], [2, 2], [7, 2], [8, 5], [7, 8], [2, 8]],
    [[5, 8], [8, 14]]
  ],
  "S": [
    [[8, 4], [6, 2], [3, 2], [2, 5], [4, 7], [7, 9], [8, 12], [6, 14], [2, 13]]
  ],
  "T": [
    [[1, 2], [9, 2]],
    [[5, 2], [5, 14]]
  ],
  "W": [
    [[2, 2], [3, 14], [5, 7], [7, 14], [8, 2]]
  ],
  "X": [
    [[2, 2], [8, 14]],
    [[8, 2], [2, 14]]
  ],
  "a": [
    [[8, 6], [8, 14]],
    [[8, 9], [5, 6], [3, 8], [3, 12], [5, 14], [8, 14]]
  ],
  "n": [
    [[2, 6], [2, 14]],
    [[2, 8], [5, 6], [8, 8], [8, 14]]
  ],
  "s": [
    [[8, 7], [6, 6], [3, 7], [7, 10], [8, 12], [6, 14], [2, 13]]
  ],
  "t": [
    [[4, 3], [4, 13], [6, 14]],
    [[2, 6], [7, 6]]
  ],
  "e": [
    [[8, 10], [2, 10], [2, 7], [5, 6], [8, 8], [8, 10], [3, 14], [7, 14]]
  ],
  "p": [
    [[2, 6], [2, 18]],
    [[2, 8], [5, 6], [8, 8], [8, 12], [5, 14], [2, 13]]
  ]
};

export class VectorFontGenerator {
  /**
   * Generates a sequence of pen strokes for writing the text on physical paper.
   * options:
   *   startX: starting X on paper (mm)
   *   startY: starting Y on paper (mm)
   *   charWidth: width of a character (mm)
   *   charHeight: height of a character (mm)
   *   charSpacing: spacing between characters (mm)
   *   lineSpacing: spacing between lines (mm)
   */
  static textToStrokes(text, options = {}) {
    const {
      startX = 180, // mm in Mirobot workspace
      startY = -40, // mm
      charWidth = 6, // mm
      charHeight = 10, // mm
      charSpacing = 2.5, // mm
      lineSpacing = 14 // mm
    } = options;

    const scaleX = charWidth / 10;
    const scaleY = charHeight / 16;
    const lines = text.split("\n");

    const allStrokes = [];
    let curY = startY;

    lines.forEach((line) => {
      let curX = startX;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const glyph = FONT_GLYPHS[char] || FONT_GLYPHS[char.toUpperCase()] || null;

        if (glyph && glyph.length > 0) {
          glyph.forEach((subStroke) => {
            const transformedSubStroke = subStroke.map(([gx, gy]) => [
              curX + gx * scaleX,
              curY + (16 - gy) * scaleY // invert Y so 0,0 is standard bottom-left oriented
            ]);
            allStrokes.push({
              char: char,
              points: transformedSubStroke
            });
          });
        }
        curX += charWidth + charSpacing;
      }
      curY -= lineSpacing; // move to next line down in Y
    });

    return allStrokes;
  }

  /**
   * Converts strokes into standard G-Code for WLKata Mirobot.
   */
  static strokesToGCode(strokes, config = {}) {
    const {
      zTravel = 22.0, // mm (Pen Up)
      zWrite = 10.5, // mm (Pen Down writing contact)
      travelSpeed = 2000, // mm/min
      writeSpeed = 800, // mm/min
      homingFirst = true
    } = config;

    const gcode = [];
    gcode.push("; WLKata Mirobot Math Writing Program");
    gcode.push("; Generated by MiRobot Math Controller");
    gcode.push("; Total strokes: " + strokes.length);
    gcode.push("G21 ; Millimeter units");
    gcode.push("G90 ; Absolute coordinates");

    if (homingFirst) {
      gcode.push("M20 G90 G00 Z" + zTravel.toFixed(2) + " F" + travelSpeed);
    }

    strokes.forEach((stroke, idx) => {
      const pts = stroke.points;
      if (pts.length === 0) return;

      const [startPt, ...rest] = pts;
      gcode.push(`; Stroke #${idx + 1} ('${stroke.char}')`);
      // 1. Move to start position with pen up
      gcode.push(`M20 G90 G00 X${startPt[0].toFixed(2)} Y${startPt[1].toFixed(2)} F${travelSpeed}`);
      // 2. Lower pen
      gcode.push(`M20 G90 G01 Z${zWrite.toFixed(2)} F${writeSpeed}`);
      // 3. Draw stroke points
      rest.forEach((pt) => {
        gcode.push(`M20 G90 G01 X${pt[0].toFixed(2)} Y${pt[1].toFixed(2)} F${writeSpeed}`);
      });
      // 4. Lift pen
      gcode.push(`M20 G90 G00 Z${zTravel.toFixed(2)} F${travelSpeed}`);
    });

    // Final safety park
    gcode.push("; Writing Complete");
    gcode.push(`M20 G90 G00 Z${zTravel.toFixed(2)} F${travelSpeed}`);
    gcode.push(`M20 G90 G00 X180.00 Y0.00 F${travelSpeed}`);
    gcode.push("M2");

    return gcode.join("\n");
  }
}

