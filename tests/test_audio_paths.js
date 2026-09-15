const fs=require('fs');
const path=require('path');
const htmlPath=path.join(__dirname,'..','index.html');
const html=fs.readFileSync(htmlPath,'utf8');
function assert(cond,msg){ if(!cond){ console.error('FAIL:',msg); process.exit(1);} }
assert(!/data:audio/i.test(html),'Audio should not be embedded');
assert(/function audioPath\(base\)/.test(html),'audioPath helper missing');
assert(/function audioPathFresh\(base\)/.test(html),'audioPathFresh helper missing');
assert(/function makeNarrationAudio\(base\)/.test(html),'makeNarrationAudio helper missing');
assert(/audio\/\$\{base\}\.mp3/.test(html),'Narration should resolve from root audio folder');
for(const f of ['screen_1.mp3','screen_2.mp3','screen_3.mp3','summary.mp3']){
  assert(fs.existsSync(path.join(__dirname,'..','audio',f)),`Missing audio file: ${f}`);
}
console.log('PASS: audio path test');
