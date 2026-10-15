import { z } from 'zod';
const name=z.string().trim().min(1,'Preencha o nome ou descrição.').max(200);
const short=z.string().trim().max(300).default('');
const money=z.number().int().min(0).max(99999999999);
const positive=money.refine(v=>v>0,'Informe um valor maior que zero.');
export const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T12:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v},'Data inválida.');
const period=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const ref=z.string().max(100).nullable().optional();
export const schemas={
 clients:z.object({name,phone:short,address:short,birthday:z.string().max(20).default(''),notes:z.string().max(2000).default('')}),
 services:z.object({name,price_cents:money,duration:z.number().int().min(5).max(1440),active:z.number().int().min(0).max(1)}),
 categories:z.object({name,kind:z.enum(['income','expense'])}),
 movements:z.object({date,kind:z.enum(['income','expense']),category_id:ref,service_id:ref,client_id:ref,description:name,amount_cents:positive,payment:name,status:z.enum(['paid','pending']),installments:z.number().int().min(1).max(120),due_date:date.nullable().optional(),notes:z.string().max(2000).default('')}).refine(v=>v.status!=='pending'||v.kind==='income','Apenas entradas podem ser vendas a prazo.').refine(v=>v.status!=='pending'||!!v.client_id,'Selecione o cliente da venda a prazo.').refine(v=>v.status!=='pending'||!!v.due_date,'Informe o vencimento da venda a prazo.').refine(v=>v.payment.toLowerCase()!=='fiado'||v.status==='pending','Fiado deve ser registrado como venda a prazo.'),
 goals:z.object({period,income_cents:money,expense_cents:money,reserve_cents:money}),
 reserves:z.object({period,name,date,amount_cents:positive,target_cents:money}).refine(v=>v.date.startsWith(v.period),'A data deve pertencer ao mês selecionado.'),
 invoices:z.object({period,name,previous_cents:money,amount_cents:money,paid:z.number().int().min(0).max(1)}),
 issues:z.object({resolved:z.number().int().min(0).max(1)}),
};
export type Entity=keyof typeof schemas;
