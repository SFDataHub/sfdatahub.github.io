from pathlib import Path
import argparse, json, hashlib, difflib, re
parser=argparse.ArgumentParser()
parser.add_argument('--baseline',required=True)
args=parser.parse_args()
import sys
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'codex'))
from workspace import artifact_path, historical_path
root=Path(__file__).resolve().parents[4]; baseline=Path(args.baseline)
fixture_root=root/'tools/guilds/fixtures/hubSearchCooperative'
out=artifact_path('tools/guilds/fixtures/hubSearchCooperative'); out.mkdir(parents=True, exist_ok=True)
workbook=historical_path('tmp/data-hub-workbook.md')
def current_file(name):
 return workbook if name == 'tmp/data-hub-workbook.md' else root/name
manifest=json.loads((baseline/'manifest.json').read_text())
allowed={
 'tmp/data-hub-workbook.md',
 'src/lib/data-hub/hubSearchProjection.ts',
 'src/lib/data-hub/hubSearchService.ts',
 'src/lib/guilds/localScanLibrary.ts',
 'tools/guilds/dataHubFinalRegression.browser.test.mts',
}

changed=[]; protected=[]; violations=[]
for name,digest in manifest.items():
 p=current_file(name); original=(baseline/name).read_bytes()
 if hashlib.sha256(original).hexdigest()!=digest:violations.append('Backup changed: '+name)
 same=p.exists() and p.read_bytes()==original
 if not same:
  changed.append(name)
  if name not in allowed:violations.append('Foreign/production change: '+name)
 if '/fixtures/' in name and p.suffix in ('.json','.png'):
  protected.append({'path':name,'byteEqual':same,'sha256':digest})
files=[current_file(name) for name in allowed]+[root/'src/lib/data-hub/hubSearchExecution.ts']+[p for p in fixture_root.rglob('*') if p.is_file()]
whitespace=[]; conflicts=[]
for p in files:
 if p.suffix not in ('.mts','.mjs','.ts','.tsx','.py','.md','.html','.json'):continue
 lines=p.read_text(encoding='utf-8-sig').splitlines()
 rel='tmp/data-hub-workbook.md' if p == workbook else str(p.relative_to(root)); before=baseline/rel
 old=before.read_text(encoding='utf-8-sig').splitlines() if before.exists() else []
 added=[(i+1,line) for tag,a,b,c,d in difflib.SequenceMatcher(a=old,b=lines,autojunk=False).get_opcodes() if tag in ('insert','replace') for i,line in enumerate(lines[c:d],c)]
 for line_no,line in added:
  if line.rstrip(' \t')!=line:whitespace.append({'path':rel,'line':line_no})
  if re.match(r'^(<<<<<<< |=======$|>>>>>>> )',line):conflicts.append({'path':rel,'line':line_no})
old=(baseline/'tmp/data-hub-workbook.md').read_bytes()
old_history=old[old.index('### W-01'.encode()):]
new=workbook.read_bytes()
history_preserved=old_history in new
(out/'baseline-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
production=[name for name in manifest if name.startswith('src/')]
result={'baselineFiles':len(manifest),'branch':'release/20261003_164432','head':'47297c3a0e5322f5a3caeb53e1fbd5f40bf6ba23','productionFiles':len(production),'productionOutsideTaskByteEqual':not any(name.startswith('src/') and name not in allowed for name in changed),'analysisByteEqual':'tmp/data-hub-analysis.md' not in changed,'historicalWorkbookW01ThroughW15ByteEqual':history_preserved,'changedExisting':sorted(changed),'protectedHistoricalFiles':protected,'afterJsonByteEqual':next(x['byteEqual']for x in protected if x['path']=='tools/guilds/fixtures/localPlayerAnalyticsExecution/after.json'),'violations':violations,'addedWhitespace':whitespace,'addedConflictMarkers':conflicts}
(out/'audit-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='protectedHistoricalFiles'},indent=2))
print('Protected historical JSON/PNG bytes:',len(protected),'equal:',sum(x['byteEqual']for x in protected))
raise SystemExit(0 if not violations and not whitespace and not conflicts and history_preserved else 1)
