#!/usr/bin/env python3
"""Validate implementation documents, without claiming to test a running application."""
from pathlib import Path
import argparse,json,re,sys
import yaml
from openapi_spec_validator import validate
from pglast import parse_sql
ROOT=Path(__file__).resolve().parents[1]
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
 spec=yaml.safe_load((ROOT/'docs/12-openapi.yaml').read_text()); errors=[]
 try:validate(spec)
 except Exception as exc:errors.append('OpenAPI schema validation: '+str(exc))
 def require(ok,msg):
  if not ok:errors.append(msg)
 def deref(v):
  if isinstance(v,dict) and '$ref' in v:
   p=v['$ref']; require(p.startswith('#/'),'External ref needs explicit validation: '+p)
   if not p.startswith('#/'):return {}
   n=spec
   for k in p[2:].split('/'):
    k=k.replace('~1','/').replace('~0','~')
    if not isinstance(n,dict) or k not in n:errors.append('Missing ref: '+p);return {}
    n=n[k]
   return n
  return v
 def walk(v):
  if isinstance(v,dict):
   if '$ref' in v:deref(v)
   for x in v.values():walk(x)
  elif isinstance(v,list):
   for x in v:walk(x)
 walk(spec)
 def norm(p):return re.sub(r'\{[^}]+\}','{id}',p.split('?')[0])
 methods={'get','post','put','patch','delete'}; ops={};ids=set()
 public={('/bootstrap','get'),('/home','get'),('/legal/{type}','get'),('/auth/otp','post'),('/auth/otp/verify','post'),('/invitations/{token}','get'),('/tools','get'),('/products','get'),('/products/{code}','get'),('/help','get'),('/payment-capabilities','get'),('/auth/wechat/callback','get'),('/admin/auth/authorize','get'),('/admin/auth/callback','get')}
 require(spec.get('security')==[{'sessionCookie':[]}],'Missing default session security')
 for path,item in spec['paths'].items():
  for m,op in item.items():
   if m not in methods:continue
   oid=op.get('operationId');require(bool(oid) and oid not in ids,'Missing/duplicate operationId '+str(oid));ids.add(oid)
   key=m.upper()+' '+norm(path);require(key not in ops,'Duplicate normalized route '+key);ops[key]={'operationId':oid,'path':path,'method':m.upper()}
   params=[deref(x) for x in item.get('parameters',[])+op.get('parameters',[])]
   named={(x.get('in'),x.get('name')) for x in params}
   for name in re.findall(r'\{([^}]+)\}',path):require(('path',name) in named,'Missing path parameter '+path+':'+name)
   for x in params:
    if x.get('in')=='path':require(x.get('required') is True and '{'+x['name']+'}' in path,'Unexpected/optional path parameter '+path)
   security=op.get('security',spec.get('security')); webhook=path.endswith('/notify')
   if security==[]:require(webhook or (path,m) in public,'Unexpected anonymous operation '+key)
   if path.startswith('/admin/') and security!=[]:
    require(security==[{'adminCookie':[]}] and op.get('x-required-scope'),'Admin scope/auth missing '+key)
   if webhook:require(op.get('x-webhook-signature-required') is True,'Webhook signature requirement missing '+path)
   if m in {'post','put','patch','delete'} and security!=[]:
    require(('header','Idempotency-Key') in named,'Idempotency missing '+key)
    require(('header','X-CSRF-Token') in named,'CSRF missing '+key)
   require(bool(op.get('responses')),'No responses '+key)
 pages=json.loads((ROOT/'docs/research/page-registry.json').read_text());trace=[]
 for p in pages:
  if p['phase'] not in ['A','B'] and p['id']!='P33':continue
  uses=p['readApis']+p['writeApis'] if p['id']!='P33' else ['GET /home']
  row={'pageId':p['id'],'name':p['name'],'phase':p['phase'],'operations':[]}
  for text in uses:
   method,path=text.split(' ',1);key=method+' '+norm(path)
   require(key in ops,'Page '+p['id']+' missing contract '+text)
   if key in ops:row['operations'].append(ops[key])
  if p['id']=='P33':row['scope']='A/B only authorized editorial content; user posts disabled until C2'
  trace.append(row)
 # SQL静态引用检查；不能取代PostgreSQL真实执行。
 sql='\n'.join(p.read_text() for p in sorted((ROOT/'infra/migrations').glob('*.sql')))
 for file in sorted((ROOT/'infra').rglob('*.sql')):
  try:parse_sql(file.read_text())
  except Exception as exc:errors.append(str(file.relative_to(ROOT))+' SQL parse: '+str(exc))
 clean=re.sub(r'--[^\n]*','',sql)
 tables=re.findall(r'CREATE TABLE\s+(\w+)',clean,re.I)
 require(len(tables)==len(set(tables)),'Duplicate table definition')
 for table in re.findall(r'(?:REFERENCES|ALTER TABLE)\s+(\w+)',clean,re.I):require(table in tables,'Undefined table '+table)
 for required in ['idempotency_records','payment_attempts','export_requests','deletion_tombstones','admin_accounts','support_tickets']:
  require(required in tables,'Missing V1 table '+required)
 for filename in ['acceptance-cases.json','ai-eval-cases.json']:
  cases=json.loads((ROOT/'docs/research'/filename).read_text());caseids=[x['id'] for x in cases]
  require(len(caseids)==len(set(caseids)),filename+' duplicate IDs')
  for case in cases:require(all(case.get(k) for k in ['id','given','when','then']),filename+' incomplete case '+str(case.get('id')))
 # 相对Markdown链接；外部链接由对应调研核验。
 for file in [ROOT/'README.md',*(ROOT/'docs').rglob('*.md')]:
  for target in re.findall(r'\]\(([^)]+)\)',file.read_text()):
   if '://' in target or target.startswith('#') or target.startswith('mailto:'):continue
   require((file.parent/target.split('#')[0]).exists(),str(file.relative_to(ROOT))+' broken link '+target)
 encoded=json.dumps({'specVersion':spec['info']['version'],'scope':'A/B including editorial P33','pages':trace},ensure_ascii=False,indent=2)+'\n'
 output=ROOT/'docs/research/v1-traceability.json'
 if args.check:require(output.exists() and output.read_text()==encoded,'Traceability stale: run tools/check_specs.py')
 elif not errors:output.write_text(encoded)
 if errors:
  print('\n'.join(errors));return 1
 print(json.dumps({'status':'passed','kind':'static-document-check','openapiSchemaValidation':True,'postgresSqlSyntaxValidation':True,'operations':len(ops),'firstReleasePages':len(trace),'sqlTables':len(tables),'businessTestsExecuted':False,'postgresMigrationsExecuted':False},ensure_ascii=False));return 0
if __name__=='__main__':sys.exit(main())
