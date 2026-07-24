import {MongoClient} from 'mongodb';
let client;export async function collection(){if(!process.env.MONGODB_URI)throw new Error('MONGODB_URI missing');if(!client)client=new MongoClient(process.env.MONGODB_URI);await client.connect();return client.db(process.env.MONGODB_DB||'cashTop').collection('pushSubscriptions')}
export function cors(res){res.setHeader('Access-Control-Allow-Origin',process.env.PUSH_ALLOWED_ORIGIN||'*');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS')}
