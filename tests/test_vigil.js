const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
let pass=0,fail=0;
function test(name,fn){try{fn();console.log('PASS',name);pass++;}catch(e){console.error('FAIL',name,'-',e.message);fail++;}}
function ok(v,msg){if(!v)throw new Error(msg||'assertion failed')}
function contains(s){ok(html.includes(s),`missing: ${s}`)}

// Package/audio contract
test('all recorded audio assets exist',()=>{
  for(const f of ['screen_1.mp3','screen_2.mp3','screen_3.mp3','summary.mp3']){
    const p=path.join(root,'audio',f);ok(fs.existsSync(p),f+' missing');ok(fs.statSync(p).size>10000,f+' unexpectedly small');
  }
});
test('recorded narration paths are wired',()=>{
  contains('const NARRATION_BASES=[');contains("'screen_1'");contains("'screen_2'");contains("'screen_3'");contains("const SUMMARY_BASE='summary'");
  contains('function audioPath(base)');contains('function audioPathFresh(base)');contains('function makeNarrationAudio(base)');
  contains('audio/${base}.mp3');contains('refreshNarrationAudio(ai)');contains('refreshSummaryAudio()');
});
test('browser speech synthesis narration was removed',()=>{ok(!html.includes('SpeechSynthesisUtterance'),'old TTS narration remains')});

// End-of-story freeze + summary lifecycle
test('visual freeze branch renders without updating simulation',()=>{
  contains('if(visualsFrozen){setMovementSfx(false);wr.render(ws,wcam);brr.render(bs,bcam);requestAnimationFrame(tick);return}');
});
test('summary starts only after final frame render',()=>{
  const render=html.indexOf('wr.render(ws,wcam);brr.render(bs,bcam);');
  const finish=html.lastIndexOf('if(finishAfterFrame){visualsFrozen=true;setMovementSfx(false);startSummary()}');
  ok(render>=0&&finish>render,'summary start is not after a final render');
});
test('restart locks during summary and unlocks only at summary end/error',()=>{
  contains("setPlayUi('summary');lockRestart(true)");
  contains('SUMMARY_AUDIO.onended=unlock');
  contains("setPlayUi('finished');lockRestart(false)");
});
test('restart guard blocks restart during active summary',()=>{contains("$('rst').onclick=()=>{if(summaryActive)return;resetRunAndPlay()}")});
test('completed story cannot be restarted from a screen tile',()=>{contains('if(summaryActive||summaryComplete||T>=END)return;ensureAudio()')});
test('restart resets freeze and summary state',()=>{
  contains('visualsFrozen=false;summaryActive=false;summaryComplete=false;finishAfterFrame=false');
});

// Screen narration behavior
test('screen narration is single-entry gated',()=>{contains('if(ai<0||ai>=NARRATION.length||ai===lastActAudio)return')});
test('screen transition plays recorded narration',()=>{contains('if(play)playNarration(ai)')});
test('screen progression waits for narration completion',()=>{contains('if(T<endT && nextT>=endT && !narrationFinishedForAct(aiBefore)) nextT=Math.max(T, endT-0.001)')});
test('pause and resume control current narration',()=>{contains('setNarrationPaused(true)');contains('setNarrationPaused(false)')});

// SFX loudness/event coverage
test('continuous fly movement SFX is removed while lifecycle hooks remain harmless',()=>{ok(!html.includes('moveOscA'),'movement oscillator remains');ok(!html.includes('moveOscB'),'second movement oscillator remains');contains('function setMovementSfx(on)');contains('Intentionally silent: continuous fly-movement audio was removed by request.');});
test('feeding SFX trigger exists',()=>{contains('if(play&&isFeeding&&!lastFeed)playEatSfx()')});
test('hazard SFX trigger exists',()=>{contains('if(play&&haz&&!lastHazard&&!dead)playHazardSfx()')});
test('sleep-entry SFX trigger exists',()=>{contains('if(play&&asleep&&!lastSleep)playSleepSfx()')});
test('rock impact crash SFX is one-shot per death',()=>{contains("if(!dth.sounded){playCrashSfx(); dth.sounded=1;}")});


// Start/restart guidance overlay
test('start guidance modal is present and shown on initial load',()=>{
  contains('id="guideOverlay"');contains("showGuide('start')");contains("action.textContent='Start the assay'");
});
test('start guidance CTA delegates to existing play control',()=>{contains("action.onclick=()=>{ov.classList.add('hidden');$('play').click()}")});
test('restart guidance appears only after summary unlock',()=>{
  const unlock=html.indexOf("const unlock=()=>{summaryActive=false;summaryComplete=true");
  const guide=html.indexOf("showGuide('restart')",unlock);
  ok(unlock>=0&&guide>unlock,'restart guide is not tied to summary completion');
});
test('restart guidance CTA uses existing reset lifecycle',()=>{contains("action.textContent='Restart the assay'");contains("action.onclick=()=>{ov.classList.add('hidden');resetRunAndPlay()}")});

// Night readability changes only
test('night ambient and moon lighting are brighter while day values remain unchanged',()=>{
  contains("hemi.intensity=lerp(.52,1.0,dayN)");contains("moonL.intensity=lerp(.66,0,dayN)");contains("sunL.intensity=lerp(0,1.15,dayN)");
});
test('night background, fog, ground and hazard glow are lifted for readability',()=>{
  contains("wr.setClearColor(day?0x142B33:0x0B1425,1)");contains("ws.fog.color.setHex(day?0x162C34:0x101A2B)");contains("soil.material.color.setHex(day?0x2E4030:0x223029)");contains("pd.gl.material.color.setHex(day?0xE8A23A:0xC94F43)");
});

// Lifecycle model test: independent deterministic regression of required states
class Model{
  constructor(){this.t=0;this.play=false;this.freeze=false;this.summary=false;this.summaryDone=false;this.restartDisabled=false;this.END=92;}
  start(){if(this.t>=this.END||this.summary||this.summaryDone)return;this.play=true;}
  step(dt){if(this.freeze)return;if(this.play){this.t+=dt;if(this.t>=this.END){this.t=this.END;this.play=false;this.freeze=true;this.summary=true;this.restartDisabled=true;}}}
  summaryEnd(){this.summary=false;this.summaryDone=true;this.restartDisabled=false;}
  restart(){if(this.summary)return false;this.t=0;this.play=true;this.freeze=false;this.summaryDone=false;return true;}
}
test('modeled E2E lifecycle: start -> screen3 end -> freeze -> summary lock -> unlock -> restart',()=>{
  const m=new Model();m.start();ok(m.play);m.step(92);ok(m.freeze&&m.summary&&m.restartDisabled&&!m.play,'end state wrong');ok(m.restart()===false,'restart should be blocked');m.summaryEnd();ok(!m.restartDisabled&&m.freeze,'summary should unlock restart but keep frozen');ok(m.restart()===true&&m.play&&!m.freeze&&m.t===0,'restart did not reset');
});

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
