const zone="America/Sao_Paulo";
const dateFormatter=new Intl.DateTimeFormat("pt-BR",{timeZone:zone,weekday:"long",day:"2-digit",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
const currency=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const stages={novo:"Recebido",orcamento:"Orçamento em preparação",agendado:"Visita em planejamento",andamento:"Serviço em andamento",concluido:"Serviço concluído",cancelado:"Solicitação cancelada"};
export const kinds=["retorno","orcamento","agendamento","andamento"];
function clean(value,max=200){return String(value||"").trim().replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").slice(0,max);}
export function customerPhone(value){
 let p=String(value||"").replace(/\D/g,"");
 if(p.length===10||p.length===11)p="55"+p;
 return p.length>=12&&p.length<=15&&p.startsWith("55")?p:"";
}
export function customerMessage(order,kind,extra=""){
 if(!kinds.includes(kind))throw Object.assign(new Error("tipo_invalido"),{status:422});
 const name=clean(order?.payload?.cliente||"cliente",90).replace(/\s+TESTE\b/ig," TESTE");
 const service=clean(order?.payload?.servico||"atendimento solicitado",130);
 const device=clean(order?.payload?.equipamento,110);
 const protocol=clean(order?.protocol,50);
 const amount=order?.estimate_amount===null||order?.estimate_amount===undefined?"":Number(order.estimate_amount);
 const when=order?.appointment_at?new Date(order.appointment_at):null;
 const proposedDate=when&&!Number.isNaN(when.getTime())?dateFormatter.format(when):"";
 const note=String(extra||"").trim();
 if(note.length>240||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(note))throw Object.assign(new Error("mensagem_adicional_invalida"),{status:422});
 const parts=[`Olá, ${name}! 👋`,"Aqui é da *Leonardo Moreira Refrigeração*.","`"];
 parts.pop();
 parts.push(`Sobre sua solicitação *${protocol}*:`,`Serviço: ${service}`);
 if(device)parts.push(`Equipamento: ${device}`);
 if(kind==="retorno")parts.push("Recebemos sua solicitação e estamos dando andamento ao atendimento. Caso tenha informações ou fotos do equipamento, pode encaminhar por aqui.");
 if(kind==="orcamento"){
  if(amount===""||!Number.isFinite(amount)||amount<=0)throw Object.assign(new Error("valor_nao_informado"),{status:422});
  parts.push(`*Valor proposto: ${currency.format(amount)}*`,"Esta é uma proposta sujeita à confirmação e às condições do serviço. Se estiver de acordo, por favor, responda a esta mensagem.");
 }
 if(kind==="agendamento"){
  if(!proposedDate)throw Object.assign(new Error("data_nao_informada"),{status:422});
  parts.push(`*Data e horário sugeridos: ${proposedDate}*`);
  if(amount!==""&&Number.isFinite(amount)&&amount>0)parts.push(`Valor informado para avaliação: ${currency.format(amount)}`);
  parts.push("Este horário é uma proposta e depende da sua confirmação. Responda se a data está boa para você; confirmaremos o agendamento em seguida.");
 }
 if(kind==="andamento"){
  parts.push(`*Situação atual: ${stages[order?.operation_status]||"Em análise"}*`);
  parts.push("Estamos à disposição para esclarecer suas dúvidas. Se precisar de mais informações, responda esta mensagem.");
 }
 if(note)parts.push(`Informação adicional: ${note}`);
 parts.push("Obrigado pela confiança! ❄️","*Leonardo Moreira Refrigeração*");
 return parts.join("\n\n");
}
