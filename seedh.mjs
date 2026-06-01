import { PrismaClient } from "./app/generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg(process.env.DATABASE_URL, { schema: "public" });
const prisma = new PrismaClient({ adapter });
const A = (await prisma.user.findFirst({ where: { name: "Andrés" }, select: { id: true } })).id;
const acct = await prisma.healthAccount.findUnique({ where: { userId: A } });
const validS = Math.round((acct.expiresAt.getTime()-Date.now())/1000);
if (validS < 30) { console.log("TOKEN EXPIRED — self-heal on next refresh"); await prisma.$disconnect(); process.exit(0); }
const tok=acct.accessToken;
const sd=await fetch("https://health.googleapis.com/v4/users/me/dataTypes/sleep/dataPoints?pageSize=30",{headers:{Authorization:`Bearer ${tok}`,Accept:"application/json"}}).then(r=>r.json());
const num=x=>{const n=Number(x);return Number.isFinite(n)?n:0;};
const hist=new Map();
for(const p of sd.dataPoints??[]){const s=p.sleep;if(!s?.summary||s.metadata?.nap===true)continue;const st={deep:0,rem:0,light:0,awake:0};for(const x of s.summary.stagesSummary??[]){const m=num(x.minutes);if(x.type==="DEEP")st.deep=m;else if(x.type==="REM")st.rem=m;else if(x.type==="LIGHT")st.light=m;else if(x.type==="AWAKE")st.awake=m;}const off=parseInt(s.interval.startUtcOffset??"0",10)||0;const date=new Date(Date.parse(s.interval.endTime)+off*1000).toISOString().slice(0,10);const asleep=num(s.summary.minutesAsleep);const pr=hist.get(date);if(!pr||asleep>pr.asleepMin)hist.set(date,{date,asleepMin:asleep,deepMin:st.deep,remMin:st.rem,lightMin:st.light,awakeMin:st.awake});}
const sleepHistory=[...hist.values()].sort((a,b)=>a.date.localeCompare(b.date));
await prisma.healthAccount.update({where:{userId:A},data:{sleepHistory}});
console.log("SEEDED",sleepHistory.length,"nights:",sleepHistory.map(h=>`${h.date.slice(5)}:${(h.asleepMin/60).toFixed(1)}h`).join(" "));
await prisma.$disconnect();
