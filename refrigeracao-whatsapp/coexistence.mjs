// Meta WhatsApp Business App coexistence: messages the owner sends from the
// mobile Business app arrive as smb_message_echoes, not inbound customer messages.
// Only a named echo for the configured number may take over a conversation.
export function appReplyPhones(change,phoneNumberId) {
  if(change?.field!=="smb_message_echoes" || String(change.value?.metadata?.phone_number_id||"")!==String(phoneNumberId||"")) return [];
  const echoes=Array.isArray(change.value?.message_echoes) ? change.value.message_echoes : [];
  return [...new Set(echoes.map(x=>String(x?.to||"").replace(/\D/g,"")).filter(x=>x.length>=10 && x.length<=15))];
}
