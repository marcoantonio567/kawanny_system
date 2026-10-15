export type Row={id:string;[key:string]:string|number|null};
export type Data={clients:Row[];services:Row[];categories:Row[];movements:Row[];goals:Row[];reserves:Row[];invoices:Row[];issues:Row[];payments:Row[];settings:Row[]};
export const amount=(r:Row,k='amount_cents')=>Number(r[k]||0);
export const label=(r:Row,k:string)=>String(r[k]||'');
