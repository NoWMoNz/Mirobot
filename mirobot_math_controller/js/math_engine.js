/**
 * Math Engine & Step-by-Step Solver for MiRobot Math Controller
 * Provides expression evaluation, validation, and step-by-step resolution.
 */

export class MathEngine {
  /**
   * Sanitizes and standardizes the math expression.
   */
  static cleanExpression(expr) {
    if (!expr) return "";
    return expr
      .replace(/×/g, "*")
      .replace(/÷/g, "/")
      .replace(/−/g, "-")
      .replace(/\s+/g, "")
      .trim();
  }

  /**
   * Formats expression for human display.
   */
  static formatForDisplay(expr) {
    if (!expr) return "";
    return expr
      .replace(/\*/g, " × ")
      .replace(/\//g, " ÷ ")
      .replace(/\+/g, " + ")
      .replace(/(?<=\d)-(?=\d)/g, " - ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Validates expression syntax and safety.
   */
  static validate(expr) {
    const cleaned = this.cleanExpression(expr);
    if (!cleaned) {
      return { valid: false, error: "Expression is empty." };
    }

    // Check allowed characters
    if (!/^[\d\.\+\-\*\/\^\(\)]+$/.test(cleaned)) {
      return { valid: false, error: "Contains invalid characters." };
    }

    // Parentheses check
    let balance = 0;
    for (const char of cleaned) {
      if (char === "(") balance++;
      if (char === ")") balance--;
      if (balance < 0) return { valid: false, error: "Mismatched parentheses." };
    }
    if (balance !== 0) {
      return { valid: false, error: "Unclosed parentheses." };
    }

    // Check consecutive invalid operators (like ++, **, */, etc., allowing negative numbers like *- or /-)
    if (/[\+\*\/]{2,}/.test(cleaned) || /\-{3,}/.test(cleaned)) {
      return { valid: false, error: "Syntax error: consecutive operators." };
    }

    // Check ending or starting with invalid operators
    if (/^[\*\/^]/.test(cleaned)) {
      return { valid: false, error: "Cannot begin with operator." };
    }
    if (/[\+\-\*\/\^]$/.test(cleaned)) {
      return { valid: false, error: "Expression cannot end with an operator." };
    }

    // Check division by zero: /0 or /0.0 followed by non-digits
    if (/\/(0+(\.0+)?)(?![0-9])/.test(cleaned)) {
      return { valid: false, error: "Division by zero is undefined." };
    }

    return { valid: true };
  }

  /**
   * Evaluates the math problem and produces a detailed step-by-step breakdown.
   */
  static solve(expression) {
    const rawClean = this.cleanExpression(expression);
    const validation = this.validate(rawClean);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const steps = [];
    let currentExpr = rawClean;
    const originalDisplay = this.formatForDisplay(rawClean);

    // Helper to evaluate a flat expression without parentheses (PEMDAS)
    const solveFlat = (expr) => {
      // 1. Exponents (^)
      const expRegex = /(-?\d+(?:\.\d+)?)\^(\d+(?:\.\d+)?)/;
      while (expRegex.test(expr)) {
        const match = expr.match(expRegex);
        const a = parseFloat(match[1]);
        const b = parseFloat(match[2]);
        const res = Math.pow(a, b);
        steps.push({
          action: "Exponentiation",
          subProblem: `${match[1]} ^ ${match[2]}`,
          result: res,
          before: expr,
          after: expr.replace(match[0], res.toString())
        });
        expr = expr.replace(match[0], res.toString());
      }

      // 2. Multiplication and Division (left to right)
      const mulDivRegex = /(-?\d+(?:\.\d+)?)([\*\/])(-?\d+(?:\.\d+)?)/;
      while (mulDivRegex.test(expr)) {
        const match = expr.match(mulDivRegex);
        const a = parseFloat(match[1]);
        const op = match[2];
        const b = parseFloat(match[3]);
        
        if (op === "/" && Math.abs(b) < 1e-12) {
          throw new Error("Division by zero encountered during calculation.");
        }

        const res = op === "*" ? a * b : a / b;
        const roundedRes = Math.round(res * 1e8) / 1e8;
        const opSymbol = op === "*" ? "×" : "÷";

        steps.push({
          action: op === "*" ? "Multiplication" : "Division",
          subProblem: `${a} ${opSymbol} ${b}`,
          result: roundedRes,
          before: expr,
          after: expr.replace(match[0], roundedRes.toString())
        });
        expr = expr.replace(match[0], roundedRes.toString());
      }

      // 3. Addition and Subtraction (handling signs)
      // Normalize double negatives like - - into +
      expr = expr.replace(/--/g, "+").replace(/\+-|-\+/g, "-");

      const addSubRegex = /(-?\d+(?:\.\d+)?)([\+\-])(\d+(?:\.\d+)?)/;
      while (addSubRegex.test(expr)) {
        const match = expr.match(addSubRegex);
        // If match starts at index 0 and op is a minus on the first number, avoid infinite loop
        if (match.index === 0 && match[1] === "" && match[2] === "-") {
          break;
        }

        const a = parseFloat(match[1]);
        const op = match[2];
        const b = parseFloat(match[3]);
        const res = op === "+" ? a + b : a - b;
        const roundedRes = Math.round(res * 1e8) / 1e8;

        steps.push({
          action: op === "+" ? "Addition" : "Subtraction",
          subProblem: `${a} ${op} ${b}`,
          result: roundedRes,
          before: expr,
          after: expr.replace(match[0], roundedRes.toString())
        });
        expr = expr.replace(match[0], roundedRes.toString());
        expr = expr.replace(/--/g, "+").replace(/\+-|-\+/g, "-");
      }

      return expr;
    };

    // Process parentheses from inside out
    const parenRegex = /\(([^()]+)\)/;
    while (parenRegex.test(currentExpr)) {
      const match = currentExpr.match(parenRegex);
      const innerExpr = match[1];
      
      steps.push({
        action: "Parentheses Evaluation",
        subProblem: `(${this.formatForDisplay(innerExpr)})`,
        result: "",
        before: currentExpr,
        note: `Evaluating inside parentheses: ${innerExpr}`
      });

      const evaluatedInner = solveFlat(innerExpr);
      currentExpr = currentExpr.replace(match[0], evaluatedInner);
    }

    // Now solve remaining expression
    const finalResultStr = solveFlat(currentExpr);
    const finalNumber = parseFloat(finalResultStr);
    const finalAnswer = Math.round(finalNumber * 1e8) / 1e8;

    // If there were no multi-step actions (e.g. single number), add a basic step
    if (steps.length === 0) {
      steps.push({
        action: "Direct Evaluation",
        subProblem: originalDisplay,
        result: finalAnswer,
        before: originalDisplay,
        after: finalAnswer.toString()
      });
    }

    return {
      problem: originalDisplay,
      rawProblem: rawClean,
      steps: steps,
      finalAnswer: finalAnswer,
      fullSolutionText: `${originalDisplay} = ${finalAnswer}`,
      stepByStepText: steps
        .map((s, idx) => `Step ${idx + 1}: ${s.action} [${s.subProblem}] → ${s.result}`)
        .join("\n") + `\nFinal Answer = ${finalAnswer}`
    };
  }

  /**
   * Generates formatted text to write based on selected writing mode.
   * mode: 'answer_only' | 'problem_answer' | 'full_steps'
   */
  static getWritingPayload(solutionResult, mode) {
    if (!solutionResult) return "";
    switch (mode) {
      case "answer_only":
        return `Ans = ${solutionResult.finalAnswer}`;
      case "problem_answer":
        return `${solutionResult.problem} = ${solutionResult.finalAnswer}`;
      case "full_steps":
        let text = `${solutionResult.problem}\n`;
        solutionResult.steps.forEach((s, idx) => {
          text += `S${idx + 1}: ${s.subProblem} = ${s.result}\n`;
        });
        text += `= ${solutionResult.finalAnswer}`;
        return text;
      default:
        return `${solutionResult.problem} = ${solutionResult.finalAnswer}`;
    }
  }
}

