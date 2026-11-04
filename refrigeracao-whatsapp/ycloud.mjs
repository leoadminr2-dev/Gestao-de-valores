import crypto from "node:crypto";

// Official YCloud webhook format: YCloud-Signature: t=<unix-seconds>,s=<sha256-hex>
// Signature = HMAC_SHA256(secret, timestamp + "." + rawRequestBody)
// A generous bounded replay window allows retries; event ID deduplication is persistent.
export function verifyYCloudSignature(raw, header, secret, now=Date.now()) {
 if (!secret || !Buffer.isBuffer(raw) || typeof header!=="string") return false;
 const parts=Object.fromEntries(header.split(",").map(p=>p.trim().split("=")).filter(x=>x.length===2));
 const timestamp=Number(parts.t),signature=String(parts.s||"");
 if(!Number.isSafeInteger(timestamp)||Math.abs(now/1000-timestamp)>3*60*60||!/^[a-f0-9]{64}$/i.test(signature))return false;
 const expected=crypto.createHmac("sha256",secret).update(String(timestamp)+".").update(raw).digest("hex");
 return crypto.timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(signature,"hex"));
}
const phone=value=>String(value||"").replace(/\D/g,"");
export function relevantYCloudEvent(event,businessNumber) {
 if(!event || typeof event!=="object" || !/^[A-Za-z0-9_-]{6,200}$/.test(String(event.id||"")))return null;
 const sender=phone(businessNumber);
 if(sender.length<10)return null;
 const type=String(event.type||"");
 if(type==="whatsapp.inbound_message.received"){
  const msg=event.whatsappInboundMessage||{};
  if(phone(msg.to)!==sender||msg.groupId)return null;
  const customer=phone(msg.from);
  if(customer.length<10||customer.length>15||customer===sender)return null;
  if(!["text","image","interactive","button"].includes(msg.type))return null;
  const text=msg.type==="text"?String(msg.text?.body||""):"";
  return {id:event.id,kind:"incoming",phone:customer,messageId:String(msg.id||event.id).slice(0,240),messageType:msg.type,text:text.slice(0,1000)};
 }
 if(type==="whatsapp.smb.message.echoes"){
  const msg=event.whatsappMessage||{};
  if(phone(msg.from)!==sender)return null;
  const customer=phone(msg.to);
  if(customer.length<10||customer.length>15||customer===sender)return null;
  return {id:event.id,kind:"manual_reply",phone:customer};
 }
 return null;
}
