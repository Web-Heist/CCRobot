// nlp-production.js — Full Production-Ready, Urdu + English, Structured Commands
// ------------------------------------------------------------
// Dependencies: natural (for tokenization)
import natural from "natural";
const tokenizer = new natural.WordTokenizer();

// ---------------- Config ----------------
const DEFAULT_CONFIDENCE = 0.85;
const LOW_CONFIDENCE = 0.5;
const HIGH_CONFIDENCE = 0.95;

// ---------------- Context Memory ----------------
const context = {
  lastDirection: null,
  lastSpeedPct: 50,
  lastHeadingDeg: 0,
  lastTurnStyle: "normal"
};

// ---------------- Urdu Lexicon ----------------
const urduLex = [
  // Directions
  { re: /\bآگے\b|\bسامنے\b|\bآگے بڑھ\b|\bآگے جاؤ\b/gi, en: "forward" },
  { re: /\bپیچھے\b|\bالٹا\b|\bریورس\b|\bواپس\b/gi, en: "backward" },
  { re: /\bدائیں\b/gi, en: "right" },
  { re: /\bبائیں\b/gi, en: "left" },

  // Movement modifiers
  { re: /\bتیز\b|\bشارپ\b/gi, en: "sharp" },
  { re: /\bذرا\b|\bتھوڑا\b/gi, en: "little" },

  // Stop
  { re: /\bرکو\b|\bروک\b|\bٹھہرو\b/gi, en: "stop" },

  // Numbers / units
  { re: /\bمیٹر\b/gi, en: "m" },
  { re: /\bسینٹی میٹر\b/gi, en: "cm" },
  { re: /\bسیکنڈ\b/gi, en: "s" },
  { re: /\bمنٹ\b/gi, en: "min" },
  { re: /\bڈگری\b/gi, en: "deg" },
  { re: /\bفیصد\b/gi, en: "%" },

  // Actions
  { re: /\bکیمرہ\b|\bتصویر\b|\bویڈیو\b/gi, en: "camera" },
  { re: /\bزوم\b/gi, en: "zoom" },
  { re: /\bتیلٹ\b/gi, en: "tilt" },
  { re: /\bپین\b/gi, en: "pan" },
  { re: /\bروشنی\b/gi, en: "lights" },
  { re: /\bسائرن\b/gi, en: "siren" },
  { re: /\bچھڑکاؤ\b/gi, en: "spray" },
  { re: /\bبجلی\b/gi, en: "taser" },

  // Connectors
  { re: /\bاور\b|\bپھر\b|\bپھر سے\b/gi, en: "and" },
  { re: /\bاب\b/gi, en: "now" }
];

// ---------------- Urdu → English ----------------
function urduToEnglish(text) {
  let s = text;
  for (const { re, en } of urduLex) s = s.replace(re, en);
  return s;
}

// ---------------- Numbers ----------------
const EN_NUM_WORDS = { zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12, thirteen:13, fifteen:15, twenty:20, thirty:30, forty:40, fifty:50, sixty:60, ninety:90, hundred:100 };
const UR_NUM_WORDS = { "صفر":0, "ایک":1, "دو":2, "تین":3, "چار":4, "پانچ":5, "چھ":6, "سات":7, "آٹھ":8, "نو":9, "دس":10, "پندرہ":15, "بیس":20, "تیس":30, "چالیس":40, "پچاس":50, "ساٹھ":60, "نوے":90, "سو":100 };

function wordToNumber(token){
  const t=token.toLowerCase();
  if(EN_NUM_WORDS[t]!=null) return EN_NUM_WORDS[t];
  if(UR_NUM_WORDS[token]!=null) return UR_NUM_WORDS[token];
  if(/^\d+(\.\d+)?$/.test(t)) return parseFloat(t);
  return null;
}

function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
function ms(sec){return Math.round(sec*1000);}

// ---------------- Clause Splitting ----------------
function splitClauses(raw) {
  // Normalize spaces
  let text = raw.replace(/\s+/g, " ").trim();

  // First split by common connectors
  let primaryClauses = text.split(/\b(?:then|and then|after that|;|,|and|phir|اور)\b/gi);

  // Further split by multiple instructions within the same clause
  const secondarySplitRegex = /\b(move|go|take|turn|rotate|stop|speed|camera|zoom|lights|siren|spray|taser)\b/gi;

  let finalClauses = [];
  primaryClauses.forEach(cl => {
    const parts = cl.split(secondarySplitRegex).map(p => p.trim()).filter(Boolean);
    // Reattach the keyword if split removed it
    for (let i = 1; i < parts.length; i += 2) {
      parts[i] = parts[i - 1].split(/\s+/).slice(-1)[0] + " " + parts[i];
    }
    finalClauses.push(...parts);
  });

  return finalClauses.filter(Boolean);
}


// ---------------- Extract Quantity ----------------
function extractQuantity(clause){
  const pct = clause.match(/\b(\d{1,3})\s*%|\b(\d{1,3})\s*percent\b/i);
  if(pct){ const p=parseInt(pct[1]||pct[2],10); if(!isNaN(p)) return {value:clamp(p,0,100), unit:"%"};}
  const rx = new RegExp(`\\b(${Object.keys(EN_NUM_WORDS).join("|")}|${Object.keys(UR_NUM_WORDS).join("|")}|\\d+(?:\\.\\d+)?)\\s*(seconds?|secs?|s|minutes?|mins?|m|meters?|meter|centimeters?|cm|degrees?|deg|percent|%|سیکنڈ|منٹ|میٹر|سینٹی میٹر|ڈگری|فیصد)?\\b`,"i");
  const m = clause.match(rx); if(!m) return {value:null, unit:null};
  const v = wordToNumber(m[1]);
  let unit = (m[2]||"").toLowerCase();
  if(!unit) return {value:v, unit:null};
  if(/^sec|^s$|سیکنڈ/.test(unit)) unit="s";
  else if(/^min|منٹ/.test(unit)) unit="min";
  else if(/^deg|ڈگری/.test(unit)) unit="deg";
  else if(/^cm|سینٹی میٹر/.test(unit)) unit="cm";
  else if(/^m(?!in)|میٹر/.test(unit)) unit="m";
  else if(unit==="%"||/percent|فیصد/.test(unit)) unit="%";
  return {value:v, unit};
}

// ---------------- Clause Parser ----------------
function parseClause(clauseRaw){
  const raw=clauseRaw.trim();
  const tokens=tokenizer.tokenize(raw.toLowerCase());
  const conf=DEFAULT_CONFIDENCE;
  const quantity=extractQuantity(raw);
  const out=[];

  // flags
  const little=/\blittle\b|\bslightly\b|\ba bit\b/i.test(raw);
  const sharp=/\bsharp\b/i.test(raw);
  const forward=/\bforward\b|\bahead\b|\bstraight\b/i.test(raw);
  const backward=/\bback\b|\bbackward\b|\breverse\b/i.test(raw);
  const left=/\bleft\b/i.test(raw);
  const right=/\bright\b/i.test(raw);
  const rotate=/\brotate\b|\bspin\b/i.test(raw);
  const turn=/\bturn\b/i.test(raw);
  const stop=/\bstop\b|\bhalt\b|\bfreeze\b/i.test(raw);
  const speedWord=/\bspeed\b|\bthrottle\b|\bvelocity\b|\bpower\b/i.test(raw);

  // Safety
  if(/\bemergency stop\b|\bpanic\b|\bkill switch\b/i.test(raw)){
    out.push({action:"safety", type:"estop", confidence:HIGH_CONFIDENCE, raw});
    return out;
  }

  // Stop command
  if(stop){ out.push({action:"move", type:"stop", confidence:HIGH_CONFIDENCE, raw}); context.lastDirection=null; return out;}

  // Speed
  if(speedWord && quantity.value!=null && (quantity.unit==="%"||quantity.unit==null)){
    const pct=clamp(quantity.value,0,100);
    out.push({action:"speed", type:"set", value:pct, unit:"%", confidence:conf, raw});
    context.lastSpeedPct=pct;
    return out;
  }

  // Directional move with duration
  if(/\bfor\b/i.test(raw) && quantity.value!=null && (quantity.unit==="s"||quantity.unit==="min")){
    const dur=quantity.unit==="min"?ms(quantity.value*60):ms(quantity.value);
    const dir=forward?"forward":backward?"backward":left?"left":right?"right":null;
    if(dir){
      out.push({action:"move", type:dir, style:sharp?"sharp":little?"little":"normal", durationMs:dur, relative:true, confidence:conf, raw});
      out.push({action:"wait", value:dur, unit:"ms", confidence:HIGH_CONFIDENCE, raw});
      out.push({action:"move", type:"stop", confidence:HIGH_CONFIDENCE, raw});
      context.lastDirection=dir; return out;
    }
  }

  // Distance
  if(quantity.value!=null && (quantity.unit==="m"||quantity.unit==="cm")){
    const meters=quantity.unit==="cm"?quantity.value/100:quantity.value;
    const dir=forward?"forward":backward?"backward":left?"left":right?"right":null;
    if(dir){
      out.push({action:"move", type:dir, distanceM:meters, style:sharp?"sharp":little?"little":"normal", relative:true, confidence:conf, raw});
      context.lastDirection=dir; return out;
    }
  }

  // Rotate
  if(rotate && quantity.value!=null && quantity.unit==="deg"){
    const dir=left?"ccw":right?"cw":"cw";
    out.push({action:"rotate", direction:dir, value:quantity.value, unit:"deg", relative:true, confidence:conf, raw});
    context.lastHeadingDeg=(context.lastHeadingDeg||0)+(dir==="cw"?quantity.value:-quantity.value);
    return out;
  }

  // Turn
  if((turn||sharp)&&(left||right)){
    out.push({action:"turn", direction:left?"left":"right", style:sharp?"sharp":"normal", relative:true, confidence:conf, raw});
    context.lastDirection=left?"left":"right"; return out;
  }

  // Simple cardinal moves
  if(forward||backward||left||right){
    const dir=forward?"forward":backward?"backward":left?"left":"right";
    out.push({action:"move", type:dir, style:sharp?"sharp":little?"little":"normal", relative:true, confidence:conf, raw});
    context.lastDirection=dir; return out;
  }

  // Camera
  if(/\bcamera\b|\bphoto\b|\bpicture\b/i.test(raw)){ out.push({action:"camera", type:"photo", confidence:conf, raw}); return out;}
  if(/\bvideo\b|\brecord\b/i.test(raw)){ out.push({action:"camera", type:"record", confidence:conf, raw}); return out;}
  if(/\bzoom\b/i.test(raw)){ out.push({action:"camera", type:"zoom", value:quantity.value??1, unit:"step", confidence:conf, raw}); return out;}

  // Siren / Lights / Spray / Taser
  if(/\bsiren\b|\balarm\b/i.test(raw)){ out.push({action:"siren", type:"toggle", confidence:conf, raw}); return out;}
  if(/\blight\b|\bflash\b/i.test(raw)){ out.push({action:"lights", type:"toggle", confidence:conf, raw}); return out;}
  if(/\bspray\b|\bgas\b|\bwater\b/i.test(raw)){ out.push({action:"spray", type:"activate", confidence:conf, raw}); return out;}
  if(/\btaser\b|\bshock\b|\bstun\b/i.test(raw)){ out.push({action:"taser", type:"fire", confidence:conf, raw}); return out;}

  // Fallback
  out.push({action:"unknown", raw, confidence:LOW_CONFIDENCE});
  return out;
}

// ---------------- Main Parser ----------------
export function parseCommandStructured(sentenceRaw){
  const normalized=urduToEnglish(sentenceRaw);
  const clauses=splitClauses(normalized);
  const commands=[];
  for(const cl of clauses){
    const parsed=parseClause(cl);
    commands.push(...parsed);
  }

  // Handle "again" fallback
  if(/\bagain\b/i.test(normalized) && !commands.some(c=>c.action!=="unknown") && context.lastDirection){
    commands.push({action:"move", type:context.lastDirection, relative:true, confidence:LOW_CONFIDENCE, raw:"again"});
  }

  return commands;
}

// ---------------- Legacy Adapter ----------------
export default function parseCommandLegacy(rawInput){
  const commands=parseCommandStructured(rawInput);
  const flat=[];
  for(const c of commands){
    if(c.action==="unknown") continue;
    switch(c.action){
      case"move":
        flat.push(c.type==="stop"?"move.stop":`move.${c.type}`);
        if(c.distanceM!=null) flat.push(`move.distance:${c.distanceM}m`);
        if(c.durationMs!=null){flat.push(`move.duration:${c.durationMs}`); flat.push(`wait:${c.durationMs}`); flat.push("move.stop");}
        break;
      case"turn": flat.push(`turn.${c.direction}`); break;
      case"rotate": flat.push(`rotate.${c.direction}.deg:${c.value}`); break;
      case"speed": flat.push(`move.speed:${c.value}`); break;
      case"camera": flat.push(c.type==="photo"?"camera.photo":c.type==="record"?"camera.record":`camera.zoom:${c.value}`); break;
      case"siren": flat.push("siren"); break;
      case"lights": flat.push("flash"); break;
      case"spray": flat.push("spray"); break;
      case"taser": flat.push("taser"); break;
      case"wait": flat.push(`wait:${c.value}`); break;
      case"safety": if(c.type==="estop") flat.push("safety.estop"); break;
      default: break;
    }
  }
  if(flat.length===0) return "unknown";
  return flat.length===1?flat:flat;
}

// ---------------- Example ----------------
const example="آگے بڑھو 2 میٹر پھر دائیں مڑو تھوڑا سا اور rotate 90 degrees پھر stop کرو";
console.log(JSON.stringify(parseCommandStructured(example),null,2));
