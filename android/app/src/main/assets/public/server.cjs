var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_url = require("url");
var import_vite = require("vite");
var import_genai = require("@google/genai");
var import_config = require("dotenv/config");
var import_meta = {};
var __filename = (0, import_url.fileURLToPath)(import_meta.url);
var __dirname = import_path.default.dirname(__filename);
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use(import_express.default.json({ limit: "30mb" }));
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });
  let aiClient = null;
  function getAI() {
    if (!aiClient) {
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        throw new Error("\u0645\u0641\u062A\u0627\u062D GEMINI_API_KEY \u063A\u064A\u0631 \u0645\u062A\u0648\u0641\u0631 \u0641\u064A \u0645\u062A\u063A\u064A\u0631\u0627\u062A \u0627\u0644\u0628\u064A\u0626\u0629.");
      }
      aiClient = new import_genai.GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });
    }
    return aiClient;
  }
  app.post("/api/gemini/analyze-invoice", async (req, res) => {
    try {
      const { image, mimeType, existingProducts, existingSuppliers } = req.body;
      if (!image || typeof image !== "string") {
        return res.status(400).json({ error: "\u064A\u0631\u062C\u0649 \u0625\u0631\u0633\u0627\u0644 \u0635\u0648\u0631\u0629 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0627\u0644\u0645\u0631\u0627\u062F \u062A\u062D\u0644\u064A\u0644\u0647\u0627." });
      }
      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
      let detectedMime = mimeType || "image/jpeg";
      if (image.startsWith("data:")) {
        const match = image.match(/^data:([^;]+);base64,/);
        if (match && match[1]) {
          detectedMime = match[1];
        }
      }
      if (!process.env.GEMINI_API_KEY) {
        return res.json({
          simulated: true,
          supplier_name: "\u0634\u0631\u0643\u0629 \u0627\u0644\u0645\u062A\u0637\u0648\u0631\u0629 \u0644\u062A\u062C\u0627\u0631\u0629 \u0648\u062A\u0648\u0632\u064A\u0639 \u0627\u0644\u0623\u062F\u0648\u064A\u0629",
          invoice_number: "INV-2026-" + Math.floor(1e3 + Math.random() * 9e3),
          invoice_date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
          payment_type: "credit",
          total_amount: 87500,
          items: [
            {
              raw_name: "Panadol Extra 500mg (24 Tab)",
              product_name_ar: "\u0628\u0646\u0627\u062F\u0648\u0644 \u0627\u0643\u0633\u062A\u0631\u0627 500 \u0645\u062C\u0645 (24 \u0642\u0631\u0635)",
              product_name_en: "Panadol Extra 500mg Tablets",
              batch_number: "BN-8821P",
              expiry_date: "2027-11-30",
              quantity: 20,
              unit_name: "\u0628\u0627\u0643\u062A",
              unit_purchase_price: 1800,
              unit_selling_price: 2400,
              discount_amount: 0
            },
            {
              raw_name: "Amoxil 500mg Capsules (20s)",
              product_name_ar: "\u0627\u0645\u0648\u0643\u0633\u064A\u0644 500 \u0645\u062C\u0645 \u0643\u0628\u0633\u0648\u0644",
              product_name_en: "Amoxil 500mg Caps",
              batch_number: "BN-4019A",
              expiry_date: "2027-08-31",
              quantity: 15,
              unit_name: "\u0628\u0627\u0643\u062A",
              unit_purchase_price: 2500,
              unit_selling_price: 3300,
              discount_amount: 0
            },
            {
              raw_name: "Cataflam 50mg (20 Tab)",
              product_name_ar: "\u0643\u062A\u0627\u0641\u0644\u0627\u0645 50 \u0645\u062C\u0645 \u0623\u0642\u0631\u0627\u0635 \u0645\u0633\u0643\u0646\u0629",
              product_name_en: "Cataflam 50mg Tablets",
              batch_number: "BN-9092C",
              expiry_date: "2028-01-31",
              quantity: 10,
              unit_name: "\u0628\u0627\u0643\u062A",
              unit_purchase_price: 1400,
              unit_selling_price: 1950,
              discount_amount: 0
            }
          ]
        });
      }
      const ai = getAI();
      const prompt = `\u0623\u0646\u062A \u062E\u0628\u064A\u0631 \u0635\u064A\u062F\u0644\u0627\u0646\u064A \u0648\u0623\u0646\u0638\u0645\u0629 \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0635\u064A\u062F\u0644\u064A\u0627\u062A (Pharmacy ERP).
\u0642\u0645 \u0628\u062A\u062D\u0644\u064A\u0644 \u0635\u0648\u0631\u0629 \u0641\u0627\u062A\u0648\u0631\u0629 \u0645\u0634\u062A\u0631\u064A\u0627\u062A \u0648\u062A\u0648\u0631\u064A\u062F \u0627\u0644\u0623\u062F\u0648\u064A\u0629 \u0627\u0644\u0645\u0631\u0641\u0642\u0629 \u0648\u0627\u0633\u062A\u062E\u0631\u062C \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0635\u064A\u062F\u0644\u0627\u0646\u064A\u0629 \u0648\u0627\u0644\u0645\u0627\u0644\u064A\u0629 \u0628\u062F\u0642\u0629 \u0639\u0627\u0644\u064A\u0629 \u0628\u062A\u0646\u0633\u064A\u0642 JSON \u062D\u0635\u0631\u0627\u064B:

\u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629:
1. "supplier_name": \u0627\u0633\u0645 \u0634\u0631\u0643\u0629 \u0627\u0644\u0623\u062F\u0648\u064A\u0629 \u0623\u0648 \u0627\u0644\u0645\u0648\u0631\u062F \u0627\u0644\u0645\u0630\u0643\u0648\u0631 \u0641\u064A \u0631\u0623\u0633 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629.
2. "invoice_number": \u0631\u0642\u0645 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0623\u0648 \u0625\u0630\u0646 \u0627\u0644\u062A\u0648\u0631\u064A\u062F.
3. "invoice_date": \u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0628\u0635\u064A\u063A\u0629 YYYY-MM-DD.
4. "payment_type": "credit" (\u0622\u062C\u0644/\u0630\u0645\u0645) \u0623\u0648 "cash" (\u0646\u0642\u062F\u0627\u064B).
5. "total_amount": \u0625\u062C\u0645\u0627\u0644\u064A \u0642\u064A\u0645\u0629 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0627\u0644\u0635\u0627\u0641\u064A \u0643\u0631\u0642\u0645 \u0639\u0627\u062F\u064A (\u0625\u0646 \u0648\u062C\u062F).
6. "items": \u0645\u0635\u0641\u0648\u0641\u0629 \u0628\u062C\u0645\u064A\u0639 \u0627\u0644\u0623\u0635\u0646\u0627\u0641 \u0627\u0644\u062F\u0648\u0627\u0626\u064A\u0629 \u0627\u0644\u0645\u0630\u0643\u0648\u0631\u0629 \u0641\u064A \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629:
   - "raw_name": \u0627\u0633\u0645 \u0627\u0644\u0635\u0646\u0641 \u0643\u0645\u0627 \u0647\u0648 \u0645\u0643\u062A\u0648\u0628 \u0641\u064A \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u062A\u0645\u0627\u0645\u0627\u064B.
   - "product_name_ar": \u0627\u0633\u0645 \u0627\u0644\u0635\u0646\u0641 \u0628\u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0628\u062F\u0642\u0629 \u0635\u064A\u062F\u0644\u0627\u0646\u064A\u0629.
   - "product_name_en": \u0627\u0633\u0645 \u0627\u0644\u0635\u0646\u0641 \u0628\u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0625\u0646\u062C\u0644\u064A\u0632\u064A\u0629 \u0627\u0644\u0639\u0644\u0645\u064A \u0623\u0648 \u0627\u0644\u062A\u062C\u0627\u0631\u064A.
   - "batch_number": \u0631\u0642\u0645 \u0627\u0644\u062A\u0634\u063A\u064A\u0644\u0629/\u0627\u0644\u062F\u0641\u0639\u0629 (Batch / Lot No). \u0625\u0630\u0627 \u0644\u0645 \u064A\u0648\u062C\u062F \u0627\u0642\u062A\u0631\u062D \u0631\u0645\u0632\u0627 \u0645\u0646\u0627\u0633\u0628\u0627 \u0645\u062B\u0644 BN-12345.
   - "expiry_date": \u062A\u0627\u0631\u064A\u062E \u0627\u0646\u062A\u0647\u0627\u0621 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0629 \u0628\u0635\u064A\u063A\u0629 YYYY-MM-DD (\u0645\u062B\u0627\u0644: 2027-05-31).
   - "quantity": \u0627\u0644\u0643\u0645\u064A\u0629 \u0627\u0644\u0645\u0648\u0631\u062F\u0629 \u0643\u0639\u062F\u062F \u0635\u062D\u064A\u062D \u0645\u0648\u062C\u0628.
   - "unit_name": \u0627\u0633\u0645 \u0627\u0644\u0648\u062D\u062F\u0629 \u0627\u0644\u0645\u0648\u0631\u062F\u0629 (\u0645\u062B\u0644 "\u0628\u0627\u0643\u062A", "\u0639\u0644\u0628\u0629", "\u0634\u0631\u064A\u0637", "\u0623\u0645\u0628\u0648\u0644\u0629", "\u0642\u0627\u0631\u0648\u0631\u0629").
   - "unit_purchase_price": \u0633\u0639\u0631 \u0634\u0631\u0627\u0621 \u0627\u0644\u0648\u062D\u062F\u0629 \u0623\u0648 \u0627\u0644\u062A\u0643\u0644\u0641\u0629 \u0643\u0631\u0642\u0645 \u0639\u0627\u062F\u064A (\u0645\u062B\u0627\u0644 2500 \u0623\u0648 120.5).
   - "unit_selling_price": \u0633\u0639\u0631 \u0628\u064A\u0639 \u0627\u0644\u0648\u062D\u062F\u0629 \u0644\u0644\u062C\u0645\u0647\u0648\u0631 \u0627\u0644\u0645\u0642\u062A\u0631\u062D \u0623\u0648 \u0627\u0644\u0645\u0633\u062C\u0644 \u0643\u0631\u0642\u0645 \u0639\u0627\u062F\u064A.
   - "discount_amount": \u0645\u0628\u0644\u063A \u0627\u0644\u062E\u0635\u0645 \u0625\u0646 \u0648\u062C\u062F.

\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u0648\u0631\u062F\u064A\u0646 \u0627\u0644\u0645\u0633\u062C\u0644\u064A\u0646 \u062D\u0627\u0644\u064A\u0627\u064B \u0644\u0644\u0645\u0637\u0627\u0628\u0642\u0629 \u0625\u0646 \u0623\u0645\u0643\u0646:
${JSON.stringify((existingSuppliers || []).slice(0, 25))}

\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0623\u062F\u0648\u064A\u0629 \u0627\u0644\u0645\u0633\u062C\u0644\u0629 \u062D\u0627\u0644\u064A\u0627\u064B \u0644\u0644\u0645\u0637\u0627\u0628\u0642\u0629 \u0625\u0646 \u0623\u0645\u0643\u0646:
${JSON.stringify((existingProducts || []).slice(0, 60).map((p) => ({ id: p.id, name_ar: p.name_ar, name_en: p.name_en })))}

\u0625\u0630\u0627 \u0643\u0627\u0646 \u0627\u0644\u0635\u0646\u0641 \u064A\u0637\u0627\u0628\u0642 \u0623\u062D\u062F \u0623\u0635\u0646\u0627\u0641 \u0627\u0644\u0635\u064A\u062F\u0644\u064A\u0629 \u0627\u0644\u0645\u0630\u0643\u0648\u0631\u0629\u060C \u0623\u0636\u0641 \u062D\u0642\u0644 "matched_product_id" \u0628\u0645\u0639\u0631\u0641 \u0627\u0644\u0635\u0646\u0641.
\u0625\u0630\u0627 \u0643\u0627\u0646 \u0627\u0644\u0645\u0648\u0631\u062F \u064A\u0637\u0627\u0628\u0642 \u0623\u062D\u062F \u0645\u0648\u0631\u062F\u064A \u0627\u0644\u0635\u064A\u062F\u0644\u064A\u0629\u060C \u0623\u0636\u0641 \u062D\u0642\u0644 "matched_supplier_id" \u0628\u0645\u0639\u0631\u0641 \u0627\u0644\u0645\u0648\u0631\u062F.

\u0623\u0631\u062C\u0639 \u0641\u0642\u0637 \u0643\u0627\u0626\u0646 JSON \u0635\u062D\u064A\u062D \u0648\u0628\u062F\u0648\u0646 \u0623\u064A \u0646\u0635\u0648\u0635 \u0625\u0636\u0627\u0641\u064A\u0629 \u0623\u0648 \u0643\u062A\u0644 Markdown.`;
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: detectedMime,
                data: base64Data
              }
            },
            {
              text: prompt
            }
          ]
        },
        config: {
          responseMimeType: "application/json",
          temperature: 0.1
        }
      });
      const rawText = response.text || "{}";
      const cleanJson = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanJson);
      return res.json(parsed);
    } catch (err) {
      console.error("Invoice Analysis Error:", err);
      return res.status(500).json({
        error: err.message || "\u062D\u062F\u062B \u062E\u0637\u0623 \u0623\u062B\u0646\u0627\u0621 \u0645\u0639\u0627\u0644\u062C\u0629 \u0635\u0648\u0631\u0629 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0628\u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A."
      });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Smart Pharmacy Server running on port ${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
