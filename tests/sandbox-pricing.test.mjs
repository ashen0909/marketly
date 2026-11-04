import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import path from 'node:path';
const root=process.cwd();
function load(name){
 const source=fs.readFileSync(path.join(root,'src/lib',name+'.ts'),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const module={exports:{}};
 new Function('require','module','exports',js)((name)=>name==='./config'?load('config'):null,module,module.exports);
 return module.exports;
}
const {quoteSandboxOrder}=load('sandbox-pricing');
test('extra post costs 100',()=>assert.equal(quoteSandboxOrder({kind:'extra_ad'}),100));
test('business 30-day plan costs 300',()=>assert.equal(quoteSandboxOrder({kind:'business'}),300));
test('boost plan price mapping',()=>assert.deepEqual(['starter','popular','premium'].map(planId=>quoteSandboxOrder({kind:'boost',planId})),[100,180,300]));
test('paid photo quotes: first five free, 100 per additional',()=>assert.deepEqual([6,7,10,12].map(photoCount=>quoteSandboxOrder({kind:'photos',photoCount})),[100,200,500,700]));
test('invalid photo count rejected',()=>{for(const n of [5,13,0,1.2,NaN])assert.throws(()=>quoteSandboxOrder({kind:'photos',photoCount:n}),RangeError)});
test('invalid boost plan rejected',()=>assert.throws(()=>quoteSandboxOrder({kind:'boost',planId:'fake'}),RangeError));
