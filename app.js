/* app.js —— 程式邏輯。畫面上的字全部從 content.js（window.CONTENT）拿，這裡不寫給人看的字。

   原則：一個畫面只做一件事；隨時可以停（每一步都自動存）。
   第四版：打開只有一個問題；答了什麼決定下一題（規則寫在 content.js 的 flow，不在這裡）；
   主視覺是一棟家，每一位陪他的人是一扇窗。

   結構：
     1. 資料（讀寫 localStorage）
     2. 小工具（跳脫字元、填數字、常用 HTML 片段）
     3. 流程（哪一步的前後是哪一步）
     4. 每一頁怎麼畫
     5. 換頁（網址 # 後面決定在哪一頁，所以瀏覽器的「上一頁」可以用）
     6. 使用者的操作（點按鈕、打字、點選項、設定、朗讀）
     7. 啟動

   網址對照：
     #/home 首頁（陪伴圈＋下一步）   #/steps 全部的步驟
     #/now/0、1、2  他現在的狀況（階段／誰照顧／哪些事要幫忙）
     #/q/3     第 4 題：只問狀態      #/q/3/a  第 4 題：回答
     #/o/origin 他現在有人陪嗎   #/o/others 還有誰在陪他   #/o/worry 最常想到哪一件
     #/stop    按「先到這裡」之後     （#/circle 已併進首頁，會自動轉過去）
     #/out/day 怎麼陪我   #/out/future 還沒有答案的事   #/res 可以找誰

   存在裝置上的資料（鍵名 udl-app）：
     { big: 0或1,
       now: { stage:'', care:[], help:[] },
       ans: { 題號: { st:'done|half|none|', text:'', picks:[], tch:'', next:'', share:false } },
       log: [ { who:'', did:'', found:'', d:'年/月/日' } ],
       res: { 資源代號: '老師填的字' },
       flow: { origin:'', others:[], othersText:'', othersDone:0, worry:'', skipped:{代號:1}, nextUp:'代號' } }
     第三版存的資料沒有 flow，讀進來時補空的，原本的回答都還在。
*/
(function () {
  'use strict';

  var app = document.getElementById('app');
  var statusBox = document.getElementById('status');
  function $(id) { return document.getElementById(id); }

  /* content.js 壞掉（少逗號、少引號）時，顯示一句話，不要整頁空白 */
  function contentBroken(e) {
    $('content-error').hidden = false;
    if (e && window.console) { window.console.error(e); }
  }

  var C = window.CONTENT;
  if (!C || !C.questions || !C.app) { contentBroken(); return; }
  var Q = C.questions;
  var KEY = 'udl-app';

  /* ============ 1. 資料 ============ */

  var storageOk = true;
  var migrated = false;
  var S = load();
  if (migrated) { save(); }   /* 舊答案換過字：馬上存回去 */

  function emptyState() {
    return { big: 0, now: { stage: '', born: '', shift: 0, care: [], help: [], at: '', stageText: '', careText: '', helpNotes: {}, careNotes: {} }, ans: {}, log: [], res: {},
      flow: { origin: '', others: [], othersText: '', othersDone: 0, worry: '', skipped: {}, nextUp: '' } };
  }

  /* 讀不到、內容壞掉都回到空白，不讓畫面掛掉 */
  function load() {
    var s = emptyState();
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && typeof d === 'object') {
          s.big = d.big ? 1 : 0;
          if (d.now) {
            s.now.stage = String(d.now.stage || '');
            s.now.born = /^(\d{1,3}|no)$/.test(String(d.now.born || '')) ? String(d.now.born) : '';   /* 出生年（民國）；'no'＝不想說 */
            s.now.shift = Math.max(-20, Math.min(20, parseInt(d.now.shift, 10) || 0));   /* 緩讀、延長修業：差幾個年級 */
            s.now.care = Array.isArray(d.now.care) ? d.now.care : [];
            s.now.help = Array.isArray(d.now.help) ? d.now.help : [];
            s.now.at = /^\d{4}-\d{1,2}$/.test(String(d.now.at || '')) ? String(d.now.at) : '';   /* 階段或年紀是哪一年哪一月填的 */
            s.now.stageText = String(d.now.stageText || '');   /* 「想多寫一點」（2026-11-18 參賽者） */
            s.now.careText = String(d.now.careText || '');
            ['helpNotes', 'careNotes'].forEach(function (f) {
              var hn = d.now[f]; s.now[f] = {};
              if (hn && typeof hn === 'object') { Object.keys(hn).forEach(function (k) { if (typeof hn[k] === 'string') { s.now[f][k] = hn[k]; } }); }
            });
          }
          if (d.ans && typeof d.ans === 'object') { s.ans = d.ans; migrate(s.ans); }
          if (Array.isArray(d.log)) { s.log = d.log; }
          if (d.res && typeof d.res === 'object') { s.res = d.res; }
          if (d.flow && typeof d.flow === 'object') {
            s.flow.origin = String(d.flow.origin || '');
            s.flow.others = Array.isArray(d.flow.others) ? d.flow.others : [];
            s.flow.othersText = String(d.flow.othersText || '');
            s.flow.othersDone = d.flow.othersDone ? 1 : 0;
            s.flow.worry = String(d.flow.worry || '');
            s.flow.skipped = (d.flow.skipped && typeof d.flow.skipped === 'object') ? d.flow.skipped : {};
            s.flow.nextUp = String(d.flow.nextUp || '');
          }
        }
      }
    } catch (e) { storageOk = false; }
    return s;
  }

  /* 選項改過字：舊答案換成新的字（C.flow.renamed）；稱呼寫在已經不是「一種人」的選項上 → 搬到補充 */
  function migrate(ans) {
    var RN = (C.flow && C.flow.renamed) || {};
    Object.keys(RN).forEach(function (id) {
      var a = ans[id], m = RN[id];
      if (!a || typeof a !== 'object' || !Array.isArray(a.picks)) { return; }
      var before = a.picks.join('|');
      a.picks = a.picks.map(function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : k; }).filter(Boolean);
      if (a.picks.join('|') !== before) { migrated = true; }
      ['names', 'notes'].forEach(function (f) {
        if (!a[f] || typeof a[f] !== 'object') { return; }
        Object.keys(m).forEach(function (k) { if (a[f][k] !== undefined) { if (m[k]) { a[f][m[k]] = a[f][k]; } delete a[f][k]; } });
      });
    });
    C.questions.forEach(function (x) {
      var a = ans[x.id];
      if (!a || typeof a !== 'object' || !a.names || typeof a.names !== 'object') { return; }
      Object.keys(a.names).forEach(function (k) {
        if ((x.nameFor || []).indexOf(k) >= 0) { return; }
        a.notes = (a.notes && typeof a.notes === 'object') ? a.notes : {};
        if (!a.notes[k]) { a.notes[k] = a.names[k]; }
        migrated = true;
        delete a.names[k];
      });
    });
  }

  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify(S)); storageOk = true; }
    catch (e) { storageOk = false; }
    showStorageNotice();
  }

  /* 取某一題的答案；沒有就建一筆空的 */
  function answer(id) {
    var a = S.ans[id];
    if (!a || typeof a !== 'object') { a = S.ans[id] = {}; }
    a.st = a.st || '';
    a.text = a.text || '';
    a.picks = Array.isArray(a.picks) ? a.picks : [];
    a.picks2 = Array.isArray(a.picks2) ? a.picks2 : [];   /* 第二組選項（題目的 more） */
    a.tch = a.tch || '';
    a.next = a.next || '';
    a.share = !!a.share;
    /* 選項對應的稱呼：{ '兄弟姊妹': '哥哥' }（2026-11-18 參賽者：勾了哪一種人，就寫那一種人的稱呼） */
    var nm = {};
    if (a.names && typeof a.names === 'object') { Object.keys(a.names).forEach(function (k) { if (typeof a.names[k] === 'string') { nm[k] = a.names[k].slice(0, 40); } }); }
    a.names = nm;
    /* 每個選項自己的補充：{ '用說的': '會說「要」' }（2026-11-18 參賽者） */
    var nt = {};
    if (a.notes && typeof a.notes === 'object') { Object.keys(a.notes).forEach(function (k) { if (typeof a.notes[k] === 'string') { nt[k] = a.notes[k]; } }); }
    a.notes = nt;
    a.sub = typeof a.sub === 'string' ? a.sub : '';   /* 選擇題的第二層（例如白天在學校 → 哪一種班） */
    return a;
  }

  function nowFilled() { return !!(S.now.born || S.now.stage || S.now.care.length || S.now.help.length || S.now.stageText.trim() || S.now.careText.trim()); }
  /* 某一組裡「原本那種」題目（先問狀態再回答的）；可列印的兩頁只列這些 */
  function byLayer(layer) { return Q.filter(function (x) { return x.layer === layer && !x.kind; }); }

  /* 記下「階段、年紀是什麼時候填的」（只記年月）。首頁用它顯示填的時間，超過一年提醒一句 */
  function stampNow() { var t = new Date(); S.now.at = t.getFullYear() + '-' + (t.getMonth() + 1); }

  /* --- 階段：填了出生年就照年紀推（大約；不精確，所以畫面上寫「大約」），沒填才用直接選的 ---
     學年從 8 月開始；1–8 月出生的 6 歲上小學。9–12 月出生、緩讀、延長修業的，用 shift（差幾個年級）修正 */
  var STAGE_GRADES = [[-99, 0], [1, 6], [7, 9], [10, 12], [13, 999]];   /* 每個階段是第幾年級到第幾年級（和 C.now.stages 同順序） */
  function bornYear() { var b = parseInt(S.now.born, 10); return b > 0 ? b + 1911 : 0; }
  function ageNow() { var b = bornYear(); return b ? new Date().getFullYear() - b : 0; }
  function gradeRaw() {
    var b = bornYear(), t = new Date();
    return b ? (t.getMonth() >= 7 ? t.getFullYear() : t.getFullYear() - 1) - b - 5 : null;
  }
  function stageNow() {
    var g = gradeRaw();
    if (g === null) { return S.now.stage; }
    g += S.now.shift || 0;
    for (var k = 0; k < STAGE_GRADES.length; k++) { if (g <= STAGE_GRADES[k][1]) { return C.now.stages[k] || ''; } }
    return '';
  }
  /* 改階段：有出生年＝記下差幾個年級（之後照樣每年往前走）；沒有＝直接記這個階段 */
  function setStage(t) {
    var k = C.now.stages.indexOf(t), g = gradeRaw();
    if (k < 0) { return; }
    if (g === null) { S.now.stage = t; } else { S.now.shift = Math.min(Math.max(g, STAGE_GRADES[k][0]), STAGE_GRADES[k][1]) - g; }
    stampNow();
  }

  /* ============ 2. 小工具 ============ */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function lines(s) { return esc(s).replace(/\n/g, '<br>'); }

  /* 把 '第 {n} 步' 裡的 {n} 換成數字 */
  function fill(text, vals) {
    return String(text).replace(/\{(\w+)\}/g, function (m, k) { return vals[k] !== undefined ? vals[k] : m; });
  }

  function stateText(st) { return C.status[st] || C.status.notStarted; }

  /* 一個選項（checkbox 或 radio 包在 label 裡） */
  function pick(o) {
    return '<label class="pick ' + o.cls + (o.on ? ' is-on' : '') + '">' +
      '<input type="' + o.type + '" name="' + o.name + '" value="' + esc(o.value) + '"' + (o.on ? ' checked' : '') + '>' +
      (o.icon ? '<span class="ico" aria-hidden="true">' + esc(o.icon) + '</span>' : '') +
      '<span>' + esc(o.label) + '</span></label>';
  }

  function textField(id, label, value, cls) {
    return '<label class="field" for="' + id + '">' + esc(label) + '</label>' +
      '<textarea id="' + id + '"' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(value) + '</textarea>';
  }

  /* 連結都加 tabindex="0"：Safari 預設按 Tab 會跳過連結，加了才停得到（對其他瀏覽器沒有影響） */
  function link(href, label, cls) { return '<a tabindex="0" class="' + cls + '" href="' + href + '">' + esc(label) + '</a>'; }
  function button(act, label, cls) { return '<button type="button" class="' + cls + '" data-act="' + act + '">' + esc(label) + '</button>'; }
  function eyebrow(text, extra) { return '<p class="eyebrow">' + esc(text) + (extra || '') + '</p>'; }

  /* 收尾畫面最下面那一顆主要按鈕 */
  function actions(html) { return '<div class="actions">' + html + '</div>'; }

  /* ============ 3. 流程 ============ */
  /* 每一題有一個代號：'q7'＝題號 7、'now'＝他現在的狀況、'origin'／'others'／'worry'＝第四版的三題、
     'res'＝可以找誰那一頁。順序與分支規則都寫在 content.js 的 flow，這裡只負責照規則走。 */

  var NOW_PARTS = ['stage', 'care', 'help'];
  var F = C.flow || {};
  var ORDER = Array.isArray(F.order) ? F.order : ['now'].concat(Q.map(function (x) { return 'q' + x.id; }));

  function inFlow(r) { return r.name === 'now' || r.name === 'q' || r.name === 'o'; }

  /* 題目的代號：題號是數字的＝'q7'；第四版新增的題目直接用它的英文 id */
  function codeOf(x) { return typeof x.id === 'number' ? 'q' + x.id : String(x.id); }
  function qIndex(node) {
    for (var i = 0; i < Q.length; i++) { if (codeOf(Q[i]) === String(node)) { return i; } }
    return -1;
  }
  function isQ(node) { return qIndex(node) >= 0; }
  function known(node) { return isQ(node) || node === 'now' || node === 'others' || node === 'worry' || node === 'origin' || node === 'res'; }

  /* 這一題答過了嗎 */
  function answered(node) {
    if (isQ(node)) { return !!answer(Q[qIndex(node)].id).st; }
    if (node === 'now') { return nowFilled(); }
    if (node === 'origin') { return !!S.flow.origin; }
    if (node === 'others') { return !!S.flow.othersDone; }
    if (node === 'worry') { return !!S.flow.worry; }
    return false;
  }
  /* 走過了嗎（答過，或按了「這題先不答」） */
  function visited(node) { return answered(node) || !!S.flow.skipped[node]; }

  /* 連到某一題（全 App 共用這一個）：答過的直接打開勾選的那一頁，不再先問「想好了／還沒想」
     （2026-11-18 參賽者：整個 App 都這樣）。還沒答、或答「現在想不到」的，照樣從第一層開始 */
  function qHref(i) {
    var a = answer(Q[i].id);
    return '#/q/' + i;
  }
  function editHref(node) { return hrefOf(node); }

  function hrefOf(node) {
    if (isQ(node)) { return qHref(qIndex(node)); }
    if (node === 'now') { return '#/now/0'; }
    if (node === 'origin' || node === 'others' || node === 'worry') { return F[node] ? '#/o/' + node : '#/now/1'; }   /* 舊資料：這三題拿掉後改到「誰照顧他」 */
    if (node === 'res') { return '#/res'; }
    return '#/home';
  }
  function titleOf(node) {
    if (isQ(node)) { return Q[qIndex(node)].title; }
    if (node === 'now') { return C.home.stepNow; }
    if (F[node] && F[node].q) { return F[node].q; }
    return C.home.stepCircle;
  }

  /* 某一題（或「階段」這類基本資料）目前的答案，拿來對規則和條件 */
  function valuesOf(of) {
    if (of === 'stage') { return [stageNow()]; }
    if (of === 'hisAge' && !isQ(of)) {   /* 舊規則寫的是年紀區間：照出生年換算 */
      var y = ageNow(), band = (C.now.ageBands || []).filter(function (b) { return y < b[0]; })[0]; return y && band ? [band[1]] : [];
    }
    if (of === 'help' || of === 'care') { return S.now[of]; }
    if (isQ(of)) { var a = answer(Q[qIndex(of)].id); return [a.st].concat(a.picks); }
    return [];
  }
  /* 條件（askIf）：每一條都要符合 */
  function meets(conds) {
    return (conds || []).every(function (c) {
      if (c.any) { return c.any.some(function (d) { return meets([d]); }); }   /* 符合其中一條就好 */
      var have = valuesOf(c.of);
      return (c.is || []).some(function (v) { return have.indexOf(v) >= 0; });
    });
  }
  function answeredCount() { return ORDER.filter(function (n) { return known(n) && answered(n); }).length; }
  /* 這一題現在該不該自己跳出來問 */
  function applicable(node) {
    if (!known(node)) { return false; }
    if (!isQ(node)) { return true; }
    var x = Q[qIndex(node)];
    return meets(x.askIf) && !(x.afterCount && answeredCount() < x.afterCount);
  }

  /* 照 order 找第一個還沒走過的 */
  function firstOpen() {
    for (var i = 0; i < ORDER.length; i++) { if (applicable(ORDER[i]) && !visited(ORDER[i])) { return ORDER[i]; } }
    return '';
  }

  /* 還沒說的題目：先列按過「先不答」的，再列還沒走到的 */
  function unanswered() {
    var list = [];
    ['others', 'worry'].concat(ORDER).forEach(function (n) { if (S.flow.skipped[n] && !answered(n) && list.indexOf(n) < 0) { list.push(n); } });
    ORDER.forEach(function (n) { if (applicable(n) && !visited(n) && list.indexOf(n) < 0) { list.push(n); } });
    return list;
  }

  /* 規則：next 可以是一個代號，或一串 { when: 答案, go: 代號 } */
  function ruleTarget(rules, values) {
    if (!rules) { return ''; }
    if (typeof rules === 'string') { return rules; }
    for (var i = 0; i < rules.length; i++) {
      var w = rules[i].when;
      if (w === undefined) { return rules[i].go; }
      var ws = Array.isArray(w) ? w : [w];
      for (var k = 0; k < ws.length; k++) { if (values.indexOf(ws[k]) >= 0) { return rules[i].go; } }
    }
    return '';
  }

  /* 從櫃子（或「怎麼陪我」）點「編輯／填寫」進來的：答完、先不答、先到這裡，都回到原本那一頁（2026-11-18 參賽者：不要跳來跳去） */
  var returnTo = '', lastHash = '';

  /* 答完之後去哪（2026-11-19 參賽者：填過的也要照順序走到下一頁，不可跳到還沒填的那一題，不然回頭改的人改不到）：
     規則指到的、排在這一題後面的那一題；沒有規則就是 order 裡這一題後面、現在該問的下一題；
     這一題是最後一題（或不在 order 裡）才找第一個還沒走過的；都走過了就看這個家。從櫃子來的回櫃子 */
  function goNext(rules, values) {
    if (returnTo) { var back = returnTo; returnTo = ''; save(); go(back); return; }
    var t = ruleTarget(rules, values || []), at = ORDER.indexOf(nodeOf(route));
    if (t !== 'res' && !(t && known(t) && applicable(t) && (at < 0 || ORDER.indexOf(t) > at || !visited(t)))) { t = ''; }
    if (!t && at >= 0) {
      for (var i = at + 1; i < ORDER.length; i++) { if (applicable(ORDER[i])) { t = ORDER[i]; break; } }
    }
    if (!t) { t = firstOpen(); }
    S.flow.nextUp = t === 'res' ? firstOpen() : t;
    save();
    go(t ? hrefOf(t) : '#/home');
  }

  /* 「這題先不答」 */
  function skipNode(node) {
    S.flow.skipped[node] = 1;
    goNext(null);
  }

  /* 首頁「接著說」要去哪 */
  function nextUnfinished() {
    var t = S.flow.nextUp;
    if (!(t && known(t) && t !== 'res' && !visited(t))) { t = firstOpen(); }
    if (!t) { t = unanswered()[0] || ''; }
    return t ? { node: t, href: hrefOf(t), title: titleOf(t) } : null;
  }

  /* 現在這個畫面是哪一題 */
  function nodeOf(r) {
    if (r.name === 'q') { return codeOf(Q[r.i]); }
    if (r.name === 'now') { return 'now'; }
    if (r.name === 'o') { return r.node; }
    return '';
  }

  /* 段（章節）：進度條和「全部的步驟」都照這個分。題目寫了 chapter 就用它，沒寫就是 layer */
  function chapterOf(node) {
    if (isQ(node)) { var x = Q[qIndex(node)]; return x.chapter || x.layer; }
    return node === 'now' ? 'know' : '';
  }
  /* 段的順序＝ order 裡各段第一次出現的順序（和實際問的順序一樣） */
  var CHAPTERS = [];
  ORDER.forEach(function (n) { var c = known(n) ? chapterOf(n) : ''; if (c && CHAPTERS.indexOf(c) < 0) { CHAPTERS.push(c); } });
  function chapterName(c) {
    return c === 'future' ? C.ask.tagFuture : c === 'know' ? C.home.groupKnow : c === 'time' ? C.home.groupTime : c === 'day' ? C.ask.tagDay : '';
  }
  /* 這一段現在會問的題目 */
  function chapterNodes(c) { return ORDER.filter(function (n) { return applicable(n) && chapterOf(n) === c; }); }
  /* 這一段：共幾題、走過幾題、現在是第幾題 */
  function chapterStep(c, here) {
    var list = chapterNodes(c);
    var past = list.filter(function (n) { return visited(n) && n !== here; }).length;
    var total = Math.max(list.length, 1), at = list.indexOf(here);
    /* 2026-11-19 參賽者：按上一步要回到上一題，小格也要跟著變 → 「第幾題」照這一題在這一段的位置（不在這一段時才用走過幾題） */
    return { total: total, done: list.filter(visited).length, n: at >= 0 ? at + 1 : Math.min(past + 1, total), list: list };
  }

  /* ============ 4. 每一頁怎麼畫 ============ */

  /* --- 陪伴圈（首頁、收尾畫面、陪伴圈頁共用） --- */

  /* 陪他的人：s 是 on（已經在陪）／mid（想到了還沒講好）／off（還空著） */
  function customNames() {
    return String(S.flow.othersText || '').split(/[、,，\n]/).map(function (t) { return t.trim(); }).filter(Boolean);
  }

  /* 陪伴圈的基本名單：照顧他的人、留過紀錄的人、每個「位置」（臨時接手的人…）、他喜歡在一起的人、還空著的那一格 */
  function basePeople() {
    var K = C.circle, P = [], seen = {};
    function on(n, why, go) { if (!seen[n]) { seen[n] = 1; P.push({ n: n, s: 'on', why: why, go: go }); } }   /* go＝去哪裡改 */
    S.now.care.forEach(function (k) { on(k, K.whyCare, '#/now/1'); });   /* 編輯＝「誰在照顧他」那一頁（不是出生年那一頁） */
    S.flow.others.forEach(function (k) { on(k, K.whyCare, hrefOf('others')); });
    customNames().forEach(function (k) { on(k, K.whyCare, hrefOf('others')); });
    if (!P.length) { on(K.you, K.whyCare, '#/now/1'); }
    S.log.forEach(function (g, k) {
      if (seen[g.who]) { return; }
      on(g.who, K.whyLog, '#/out/day');
      if (!P.some(function (p) { return p.lines; }) && K.firstShort) { P[P.length - 1].lines = [K.firstShort, shortName(g.who)]; }   /* 第一位留紀錄的人＝第二個陪他的人 */
    });
    Q.forEach(function (x, i) {
      if (!x.circleName) { return; }
      var a = answer(x.id), st = a.st, who = pickedWho(x, a);
      var p = { n: x.circleName, s: st === 'done' ? 'on' : (st === 'half' ? 'mid' : 'off'), go: editHref(codeOf(x)),
        why: st === 'done' ? K.whyDone : (st === 'half' ? K.whyHalf : K.whyNone) };
      if (who.length) {   /* 勾了哪一種人：窗上寫「臨時接手／哥哥」，完整的（哥哥（兄弟姊妹）、…）放在名字裡給清單和報讀用 */
        p.n = x.circleName + '：' + who.map(function (w) { return w.name ? w.name + '（' + w.pick + '）' : w.pick; }).join('、');
        p.who = who.map(function (w) { return w.name ? w.name + '（' + w.pick + '）' : w.pick; });
        p.lines = [x.circleShort || x.circleName, who.length > 1 ? fill(K.peopleCount, { n: who.length }) : shortName(who[0].name || who[0].pick)];
      }
      P.push(p);
    });
    Q.forEach(function (x) {
      if (x.circleFromOptions) { answer(x.id).picks.forEach(function (k) { if (!seen[k]) { seen[k] = 1; P.push({ n: k, s: 'on', why: K.whyLikes, go: editHref(codeOf(x)) }); } }); }
    });
    if (!S.log.length) { P.push({ n: K.firstName, s: 'off', go: '#/out/day', why: K.firstWhy }); }
    return P.slice(0, 9);
  }

  /* 這一題勾了哪幾種「人」（nameFor 裡的選項），各自的稱呼 */
  function pickedWho(x, a) {
    return a.picks.filter(function (k) { return (x.nameFor || []).indexOf(k) >= 0; })   /* 照勾的順序 */
      .map(function (k) { return { pick: k, name: String(a.names[k] || '').trim() }; });
  }
  function shortName(t) { t = String(t); return t.length > 4 ? t.slice(0, 4) + '…' : t; }

  /* 「全部」＝基本名單＋白天、晚上、假日出現的每一個人（2026-11-17 參賽者指出：白天亮的學校老師，「全部」裡卻沒有）。
     亮著的排前面、想到了還沒講好的其次、空位最後，最多 9 扇窗 */
  function people() {
    var B = basePeople(), K = C.circle, d = dayView(), n = nightView(), have = {}, add = [];
    B.forEach(function (p) { have[p.n] = 1; });
    d.lit.forEach(function (x) { if (!have[x]) { have[x] = 1; add.push({ n: x, s: 'on', why: K.whyTime, go: editHref('day') }); } });
    n.lit.forEach(function (x) { if (!have[x]) { have[x] = 1; add.push({ n: x, s: 'on', why: K.whyTime, go: editHref('night') }); } });
    d.hol.forEach(function (x) { if (!have[x]) { have[x] = 1; add.push({ n: x, s: 'mid', why: K.whyHoliday, go: editHref('holiday'), label: HS.tapMid }); } });   /* 小視窗寫「假日和寒暑假陪他」，不是「還沒講好」 */
    var all = B.concat(add), rank = { on: 0, mid: 1, off: 2 };
    return all.map(function (p, i) { return [p, i]; }).sort(function (a, b) { return rank[a[0].s] - rank[b[0].s] || a[1] - b[1]; })
      .map(function (x) { return x[0]; }).slice(0, 9);
  }

  function stateName(s) { var K = C.circle; return s === 'on' ? K.stateOn : (s === 'mid' ? K.stateMid : K.stateOff); }

  /* 有沒有填過任何東西 */
  function started() { return nowFilled() || S.log.length > 0 || !!S.flow.origin || Object.keys(S.flow.skipped).length > 0 || Q.some(function (x) { return answer(x.id).st; }); }   /* 按過「先不答」也算開始了 */

  /* 圈旁邊那一句話。還沒填任何東西時不替使用者下結論 */
  function headline(P) {
    var K = C.circle, on = P.filter(function (p) { return p.s === 'on'; }).length;
    if (!started() && K.headlineEmpty) { return K.headlineEmpty; }
    return on <= 1 ? K.headlineOne : fill(on < 4 ? K.headlineFew : K.headlineMany, { n: on });
  }

  /* 窗裡最多放 12 個字（4 個字一行、最多 3 行）；太長的只在圖上截短，完整的名字在「一個一個看」 */
  function ringName(n) { n = String(n); return n.length > 12 ? n.slice(0, 11) + '…' : n; }

  /* 窗的三種樣子。不只靠顏色：亮著＝實線；想到了還沒講好＝長虛線；還空著＝點線 */
  var WINDOW_LOOK = {
    on: 'fill="#ffd77a" stroke="#a8442c" stroke-width="3"',
    mid: 'fill="#fff0c2" stroke="#a8442c" stroke-width="3" stroke-dasharray="10 6"',
    off: 'fill="#f3e7d2" stroke="#7a6654" stroke-width="3" stroke-dasharray="1 7" stroke-linecap="round"'
  };

  /* 畫一棟家（自己畫的 SVG）。他在屋頂的圓窗，P 裡每個人一扇窗；人多了房子會變寬或變高。
     圖是給眼睛看的（對報讀器隱藏）；旁邊一定有一句文字，完整名單在「一個一個看」。
     字的大小是畫在圖裡的，所以開「大字」或螢幕很窄時改排兩欄，讓字不要縮得太小 */
  var tapP = [];   /* 首頁那棟家每扇窗是誰（點窗跳出小視窗用） */
  function house(P, opt) {
    opt = opt === true ? { noLegend: true } : (opt || {});
    if (opt.tap) { tapP = []; }   /* opt：noLegend 不放圖例／night 晚上的樣子／other 另一棟房子／legend 換一組圖例 */
    /* 排法：他在屋頂正下方、房子的正中央，陪他的人的窗圍在旁邊。
       一律三欄（他佔中間那一格）。舊版大字或螢幕很窄時改兩欄，參賽者覺得太狹長，2026-11-18 起不用（下面兩欄的分支留著不會走到） */
    var hits = '', big = !!S.big, cols = 3,   /* 一律三欄（2026-11-18 參賽者：兩欄的家太狹長）；大字時窗和字整體放大 1.2 倍 */
       u = big ? 1.2 : 1;
    var ww = 86 * u, wh = 64 * u,   /* 一律三欄後，320 寬的手機上窗要高過 48px 才點得到 */
       gap = 10, pad = 16, fs = 14 * u;
    var n = Math.max(cols === 3 ? 5 : 4, P.length), rows, heRow, cells = [], r, cc;
    if (cols === 3) {
      rows = Math.ceil((n + 1) / 3); n = rows * 3 - 1; heRow = Math.floor((rows - 1) / 2);
      for (r = 0; r < rows; r++) { for (cc = 0; cc < 3; cc++) { if (!(r === heRow && cc === 1)) { cells.push([cc, r]); } } }
    } else {
      rows = Math.ceil(n / 2) + 1; n = (rows - 1) * 2; heRow = 0;
      for (r = 1; r < rows; r++) { cells.push([0, r]); cells.push([1, r]); }
    }
    var bodyW = cols * ww + (cols - 1) * gap + pad * 2, bodyH = rows * wh + (rows - 1) * gap + pad * 2;
    var W = Math.max(300, bodyW + 56), top = 16, roofH = 78 * u;   /* 兩邊留白收窄，同樣的螢幕寬度下房子比較大 */
    var bx = (W - bodyW) / 2, by = top + roofH, H = by + bodyH + 30, cx = W / 2;
    var heY = by + pad + heRow * (wh + gap) + wh / 2;
    function f(v) { return Math.round(v * 10) / 10; }
    var maxW = 'max-width:' + f(W / (big ? 21 : 17)) + 'rem';
    var s = '<svg class="house" viewBox="0 0 ' + f(W) + ' ' + f(H) + '" aria-hidden="true" focusable="false"' + (opt.tap ? '' : ' style="' + maxW + '"') + '>';
    if (opt.night) {   /* 晚上：深藍的天、月亮、幾顆星 */
      s += '<rect class="sky" x="0" y="0" width="' + f(W) + '" height="' + f(H) + '" rx="18" fill="#35415f"/>';
      s += '<g class="moon"><circle cx="' + f(W - 40) + '" cy="40" r="20" fill="#ffe9a8"/><circle cx="' + f(W - 31) + '" cy="33" r="17" fill="#35415f"/></g>';
      [[30, 34], [70, 18], [W * 0.36, 30], [W * 0.62, 14], [W - 92, 62]].forEach(function (c) { s += '<circle cx="' + f(c[0]) + '" cy="' + f(c[1]) + '" r="2" fill="#ffe9a8"/>'; });
    } else {
      s += '<circle class="sun" cx="' + f(W - 40) + '" cy="40" r="22" fill="#ffd77a"/>';
    }
    var hill1 = opt.night ? '#5d7f6b' : '#8fb39a', hill2 = opt.night ? '#4f6f5d' : '#7aa387', roof = opt.other ? '#6a8fb0' : '#d9735a';
    s += '<path d="M0 ' + f(H - 46) + ' Q' + f(W * 0.2) + ' ' + f(H - 84) + ' ' + f(W * 0.42) + ' ' + f(H - 58) + ' T' + f(W * 0.8) + ' ' + f(H - 70) + ' T' + f(W) + ' ' + f(H - 56) + ' V' + f(H) + ' H0Z" fill="' + hill1 + '"/>';
    s += '<path d="M0 ' + f(H - 24) + ' Q' + f(W * 0.25) + ' ' + f(H - 48) + ' ' + f(W * 0.5) + ' ' + f(H - 30) + ' T' + f(W) + ' ' + f(H - 34) + ' V' + f(H) + ' H0Z" fill="' + hill2 + '"/>';
    s += '<g transform="translate(' + f(Math.max(2, bx - 62)) + ' ' + f(H - 150) + ')"><path d="M6 76 q-16 -34 10 -46 q4 -30 34 -18 q26 -8 28 22 q20 14 4 42Z" fill="#6f9a7d"/><rect x="34" y="70" width="8" height="42" rx="3" fill="#8a6a55"/></g>';
    if (!opt.other) { s += '<rect x="' + f(cx + bodyW * 0.2) + '" y="' + f(top + roofH * 0.22) + '" width="20" height="' + f(roofH * 0.5) + '" rx="3" fill="#d9735a" stroke="#3b2f2a" stroke-width="3"/>'; }   /* 煙囪（另一棟房子沒有，樣子才分得出來） */
    s += '<rect x="' + f(bx) + '" y="' + f(by - 6) + '" width="' + f(bodyW) + '" height="' + f(bodyH + 6) + '" rx="6" fill="#fffaf0" stroke="#3b2f2a" stroke-width="3"/>';
    s += '<path d="M' + f(bx - 20) + ' ' + f(by + 2) + ' L' + f(cx) + ' ' + f(top) + ' L' + f(bx + bodyW + 20) + ' ' + f(by + 2) + ' Z" fill="' + roof + '" stroke="#3b2f2a" stroke-width="3" stroke-linejoin="round"/>';
    /* 他：房子正中央的圓 */
    s += '<g class="he"><circle cx="' + f(cx) + '" cy="' + f(heY) + '" r="' + f(wh / 2 - 1) + '" fill="#ffe2b8" stroke="#8a4a00" stroke-width="3"/>';
    s += '<text x="' + f(cx) + '" y="' + f(heY + 8 * u) + '" text-anchor="middle" font-size="' + f(22 * u) + '" font-weight="800" fill="#8a4a00">' + esc(C.circle.center) + '</text></g>';
    if (opt.tap) {   /* 點「他」：跳出小視窗，看他現在的階段和年紀、去更新 */
      var hr = wh / 2 - 1;
      hits += '<button type="button" class="win-hit he-hit" data-act="he" style="left:' + f((cx - ww / 2) / W * 100) + '%;top:' + f((heY - wh / 2) / H * 100) + '%;width:' + f(ww / W * 100) + '%;height:' + f(wh / H * 100) + '%">' +
        '<span class="sr">' + esc(C.home.heTitle + '：' + stageInfo().text) + '</span></button>';
    }
    for (var k = 0; k < n; k++) {
      var p = P[k] || { n: '', s: 'off' };
      var x = bx + pad + cells[k][0] * (ww + gap), y = by + pad + cells[k][1] * (wh + gap);
      var name = ringName(p.n), parts = [];
      if (p.lines) { parts = p.lines.slice(0, 2); } else { for (var c = 0; c < name.length; c += 4) { parts.push(name.slice(c, c + 4)); } }
      s += '<g class="win ' + p.s + '"><rect x="' + f(x) + '" y="' + f(y) + '" width="' + f(ww) + '" height="' + f(wh) + '" rx="' + f(13 * u) + '" ' + WINDOW_LOOK[p.s] + '/>';
      parts.forEach(function (t, li) {
        s += '<text x="' + f(x + ww / 2) + '" y="' + f(y + wh / 2 + fs * 0.36 + (li - (parts.length - 1) / 2) * fs * 1.2) + '" text-anchor="middle" font-size="' + f(fs) + '" font-weight="800" fill="#3b2f2a">' + esc(t) + '</text>';
      });
      s += '</g>';
      /* 首頁：每扇有人的窗疊一顆真正的按鈕（圖本身對報讀器隱藏），點了跳出小視窗看是誰 */
      if (opt.tap && p.n) {
        tapP[k] = p;
        hits += '<button type="button" class="win-hit" data-act="win" data-k="' + k + '" style="left:' + f(x / W * 100) + '%;top:' + f(y / H * 100) + '%;width:' + f(ww / W * 100) + '%;height:' + f(wh / H * 100) + '%;border-radius:' + f(13 * u / ww * 100) + '% / ' + f(13 * u / wh * 100) + '%">' +
          '<span class="sr">' + esc(p.n + '，' + (p.label || stateName(p.s)) + (p.who && p.who.length > 1 ? '，' + fill(C.circle.peopleCount, { n: p.who.length }) : '')) + '</span></button>';
      }
    }
    s += '</svg>';
    var cap = opt.cap ? '<p class="sub center house-cap" data-say>' + esc(opt.cap) + '</p>' : '';   /* 在家的框裡、房子正下方 */
    /* 按鈕的位置是照 SVG 的寬高算的百分比，所以只能和 SVG 包在同一層；說明文字放外面，否則框變高、按鈕往下偏 */
    if (opt.tap) { s = '<div class="house-wrap" style="' + maxW + '"><div class="house-stage">' + s + hits + '</div>' + cap + '</div>'; } else { s += cap; }
    if (!P.length || opt.noLegend) { return s; }   /* 窗都還空著、或畫面要精簡的時候不放圖例 */
    var items = opt.legend || [['on', C.circle.shapeOn + '：' + stateName('on')], ['mid', C.circle.shapeMid + '：' + stateName('mid')], ['off', C.circle.shapeOff + '：' + stateName('off')]];
    s += '<details class="legend-box"><summary>' + esc(C.circle.legendTitle) + '</summary><ul class="legend" aria-label="' + esc(C.circle.legendTitle) + '">';
    items.forEach(function (g) {
      s += '<li><span class="swatch ' + g[0] + '" aria-hidden="true"></span>' + esc(g[1]) + '</li>';
    });
    return s + '</ul></details>';
  }

  /* --- 同一棟家的幾個樣子：全部／白天／晚上／以後（只是換個角度看已經填的內容，不計算、不預測） --- */

  var houseMode = 'all';   /* 一天裡的哪個時候：全部／白天／晚上；只記在這一次開啟裡 */
  /* 2026-11-19 參賽者：選了「以後」再點「晚上」，會跳回現在的階段 → 「現在／以後」（上面的階段條）和「全部／白天／晚上」分開記 */
  var houseWhen = 'now';
  var HS = C.house || {};

  function ansOf(node) { return isQ(node) ? answer(Q[qIndex(node)].id) : { st: '', picks: [], text: '' }; }
  /* 「點人物」那種題目答了誰（點的＋自己打的稱呼） */
  function namesIn(node) {
    var a = ansOf(node);
    return a.picks.concat(String(a.text || '').split(/[、,，\n]/).map(function (t) { return t.trim(); }).filter(Boolean));
  }
  /* 第 8 題選了現在的家以外的哪個地方（沒有就回空字串） */
  function movePlace() {
    var places = HS.future || {}, q8 = ansOf('q8').picks;
    if (q8.length) { return q8.filter(function (t) { return places[t]; })[0] || ''; }
    /* 以後住哪裡還沒答：畢業之後選了社區居住或住宿機構，也算換地方（2026-11-19 參賽者） */
    return ansOf('afterGrad').picks.filter(function (t) { return places[t]; })[0] || '';
  }
  function modesNow() {
    var m = [];
    /* 四顆固定出現（2026-11-17 參賽者指定）；那一題還沒答的時候，圖下面是一句「還沒有說」和去答題的連結 */
    if (HS.modeDay) { m.push('day'); }
    if (HS.modeNight) { m.push('night'); }
    return m;
  }

  function uniq(list) { return list.filter(function (x, k) { return x && list.indexOf(x) === k; }); }
  /* 平常陪他的人（亮著的那些） */
  function regulars(P) { return P.filter(function (p) { return p.s === 'on'; }).map(function (p) { return p.n; }); }

  /* 白天／晚上／以後的家的一扇窗：帶上原本那個人的完整資料（兩行的窗名、勾了誰、去哪裡改），
     不然窗名會被硬切、點了也沒有「編輯」（2026-11-18 參賽者） */
  function winOf(P, n, s, go) {
    var b = P.filter(function (p) { return p.n === n; })[0] || {};
    return { n: n, s: s, lines: b.lines, who: b.who, go: go || b.go, why: b.why,
      label: s === 'mid' ? HS.tapMid : (s === 'off' ? HS.tapOff : '') };
  }

  /* 白天：學校（或白天去的地方）那扇窗亮著；答「在家」「其他」＝平常照顧他的人亮著。假日陪他的人用長虛線 */
  function dayView() {
    var P = basePeople(), d = ansOf('day').picks[0] || '', named = (HS.dayWindows || {})[d];
    var carers = S.now.care.length ? S.now.care.slice() : [C.circle.you];
    var sub = ansOf('day').sub, paid = HS.dayHomeHelp || [];   /* 在家，選了居家服務員／個人助理 → 白天亮那一扇 */
    var lit = !answered('day') ? [] : (named ? [named] : (paid.indexOf(sub) >= 0 ? [sub] : carers));
    var hol = uniq(namesIn('holiday')).filter(function (n) { return lit.indexOf(n) < 0; });
    /* 2026-11-18 參賽者：這個時候沒有陪的人不放進窗（原本畫成點線框，看起來像「還沒講好」） */
    return { lit: lit, hol: hol,
      P: lit.map(function (n) { return winOf(P, n, 'on', named ? hrefOf('day') : hrefOf('day')); })
        .concat(hol.map(function (n) { return winOf(P, n, 'mid', hrefOf('holiday')); })).slice(0, 9) };
  }

  function nightView() {
    var P = basePeople(), lit = uniq(namesIn('night'));   /* 只放晚上陪他的人（其他人不畫點線框） */
    return { lit: lit, P: lit.map(function (n) { return winOf(P, n, 'on', hrefOf('night')); }).slice(0, 9) };
  }

  /* 以後：亮著的只有「以後誰陪他」那一題答的人（不用猜的）；換住處的話再加那裡會有的空窗 */
  function futureView() {
    var P = basePeople(), place = movePlace(), extra = (HS.future || {})[place] || [], lit = uniq(namesIn('futureWho'));
    return { place: place, lit: lit, P: lit.map(function (n) { return winOf(P, n, 'on', hrefOf('futureWho')); })
      .concat(extra.filter(function (n) { return lit.indexOf(n) < 0; }).map(function (n) { var w = winOf(P, n, 'off', hrefOf('futureWho')); w.label = HS.tapNew; return w; })).slice(0, 9) };
  }
  /* 「以後」的白天：「畢業之後」選了哪裡，就亮那裡的人那一扇；選留在家裡＝「以後誰陪他」答的人。沒答、還不知道＝窗空著 */
  function futureDayView() {
    var P = basePeople(), pick = ansOf('afterGrad').picks[0] || '', name = (HS.futureDayWindows || {})[pick], lit = [], go = hrefOf('afterGrad');
    if (pick && pick === HS.futureDayHome) { lit = uniq(namesIn('futureWho')); go = hrefOf('futureWho'); } else if (name) { lit = [name]; }
    var seeking = !lit.length && isQ('afterGrad') && (!pick || pick === Q[qIndex('afterGrad')].unknown) && (pick || meets(Q[qIndex('afterGrad')].askIf));
    var W = lit.map(function (n) { return winOf(P, n, 'on', go); });
    if (seeking) { W.push({ n: C.home.path.seek, s: 'off', go: resHref('r4'), label: C.home.path.seekTap, goLabel: C.home.path.nudgeLink }); }   /* 2026-11-20：還在找＝一扇空窗，點了看要走哪些路 */
    return { lit: lit, seeking: seeking, P: W.slice(0, 9) };
  }
  /* 「以後」的晚上：住宿型機構、社區居住＝那裡的工作人員；搬去其他家人家＝那個家的家人；其他＝「以後誰陪他」答的人 */
  function futureNightView() {
    var P = basePeople(), place = movePlace(), staff = (HS.futureNight || {})[place] || [], who = uniq(namesIn('futureWho'));
    var away = staff.indexOf(HS.futureAwayWin) >= 0;   /* 住到機構或社區居住：家人晚上不在那裡 */
    var lit = away ? (who.indexOf(HS.futureStaffPick) >= 0 ? [HS.futureStaffPick] : staff) : uniq(staff.concat(who));
    return { place: place, lit: lit, P: lit.map(function (n) {
      var w = winOf(P, n, 'on', staff.indexOf(n) >= 0 ? hrefOf(isQ('q8') && ansOf('q8').picks.length ? 'q8' : 'afterGrad') : hrefOf('futureWho'));
      if (staff.indexOf(n) >= 0 || n === HS.futureStaffPick) { w.label = HS.tapNew; }
      return w;
    }).slice(0, 9) };
  }
  /* 「以後」的白天：接「畢業之後，白天去哪裡」那一題。那一題沒有在問（階段不符合、也沒答過）就不顯示 */
  function futureDayLine() {
    if (!isQ('afterGrad')) { return ''; }
    var x = Q[qIndex('afterGrad')], pick = answer(x.id).picks[0] || '';
    if (!pick && !meets(x.askIf)) { return ''; }
    var see = x.see ? '<p class="center">' + link(resHref(x.see), HS.futureDaySee, 'tool') + '</p>' : '';
    if (pick && pick !== x.unknown) { return '<p class="center" data-say>' + esc(fill(HS.futureDayLine, { place: pick })) + '</p>' + see; }
    return askLine(HS.futureDayNone, 'afterGrad') + see;
  }

  /* 以後住宿型機構：假日可能接回家、也可能留在機構（2026-11-19 參賽者同意） */
  function futureHolidayLine() {
    return (HS.futureHolidayFor || []).indexOf(movePlace()) >= 0 ? '<p class="sub center holiday-note" data-say>' + esc(HS.futureHoliday) + '</p>' : '';
  }
  /* 「以後」的晚上：一律連到「以後他要住哪裡」（和白天的「看白天有哪幾種地方」對稱） */
  function futureNightSee() {
    if (!isQ('stayHome')) { return ''; }
    return '<p class="center">' + link(resHref(Q[qIndex('stayHome')].see), HS.futureNightSee, 'tool') + '</p>';
  }
  /* 「以後」：可能要換地方、還沒想過、或已經選了別的住處 → 連到「以後他要住哪裡」那一格 */
  function futurePlaceLine() {
    if (!isQ('stayHome')) { return ''; }
    var x = Q[qIndex('stayHome')], st = answer(x.id).picks[0] || '';
    if (!(movePlace() || (x.seeWhen || []).indexOf(st) >= 0)) { return ''; }
    return '<p class="center">' + link(resHref(x.see), HS.futurePlaceSee, 'tool') + '</p>';
  }

  /* 「以後」圖下面那一句：答了＝寫出名字；還沒答＝一句話加去填寫的連結 */
  function futureWhoLine(lit) {
    if (lit.length) { return '<p class="center" data-say="names">' + esc(fill(HS.futureWhoLine, { names: lit.join('、') })) + '</p>'; }
    return isQ('futureWho') ? askLine(HS.futureWhoNone, 'futureWho') : '';
  }

  /* 現在的家的小圖（「以後」那個樣子用，放在新房子上面） */
  function miniHome() {
    return '<svg class="mini-home" viewBox="0 0 64 56" aria-hidden="true" focusable="false"><rect x="14" y="26" width="36" height="26" rx="3" fill="#fffaf0" stroke="#3b2f2a" stroke-width="2.5"/>' +
      '<path d="M8 28 L32 6 L56 28 Z" fill="#d9735a" stroke="#3b2f2a" stroke-width="2.5" stroke-linejoin="round"/><rect x="27" y="36" width="10" height="16" rx="2" fill="#ffd77a" stroke="#3b2f2a" stroke-width="2"/></svg>';
  }

  function modeSwitch(modes) {
    var names = { all: HS.modeAll, day: HS.modeDay, night: HS.modeNight, future: HS.modeFuture }, icons = { all: '🏠', day: '☀️', night: '🌙', future: '➜' };
    var h = '<div class="modes" role="group" aria-label="' + esc(HS.modeLabel) + '">';
    ['all'].concat(modes).forEach(function (m) {
      h += '<button type="button" class="tool" data-act="mode" data-m="' + m + '" aria-pressed="' + (houseMode === m ? 'true' : 'false') + '">' +
        '<span aria-hidden="true">' + icons[m] + '</span><span>' + esc(names[m]) + '</span></button>';
    });
    return h + '</div>';
  }

  /* 圖上有虛線的窗：一行小字寫出是誰、什麼意思（假日陪他／想到了還沒講好） */
  function midNote(P) {
    var mid = P.filter(function (p) { return p && p.s === 'mid'; }), out = '';
    var hol = mid.filter(function (p) { return p.label === HS.tapMid; }).map(function (p) { return p.n; });
    var half = mid.filter(function (p) { return p.label !== HS.tapMid; }).map(function (p) { return p.n; });
    if (hol.length) { out += '<p class="sub center mid-note" data-say>' + esc(fill(HS.midHoliday, { names: hol.join('、') })) + '</p>'; }
    if (half.length) { out += '<p class="sub center mid-note" data-say>' + esc(fill(HS.midHalf, { names: half.join('、') })) + '</p>'; }
    return out;
  }

  function askLine(text, node) {
    return '<p class="sub center">' + esc(text) + '</p><p class="center">' + link(hrefOf(node), HS.toQuestion + '：' + titleOf(node), 'tool') + '</p>';
  }

  /* 「畢業後白天去哪裡，要走一段路」：先講流程、再給名單（2026-11-20 參賽者：不是想去就能去，要委婉；及早規劃） */
  function pathCard(withFind) {
    var A = C.home.path;
    return '<section class="path-card" aria-label="' + esc(A.title) + '"><h2>' + esc(A.title) + '</h2><ol>' +
      A.steps.map(function (t) { return '<li data-say>' + esc(t) + '</li>'; }).join('') + '</ol>' +
      '<p data-say>' + esc(A.note) + '</p>' + (withFind ? '<p class="center">' + link(resHref('r4'), A.find, 'tool') + '</p>' : '') + '</section>';
  }
  /* 首頁：國中、高中職，「畢業之後去哪裡」還沒答（或答還不知道）→ 一行小卡 */
  function pathNudge() {
    var A = C.home.path, st = stageNow();
    if ((A.nudgeStages || []).indexOf(st) < 0 || !isQ('afterGrad')) { return ''; }
    var x = Q[qIndex('afterGrad')], pick = answer(x.id).picks[0] || '';
    if (pick && pick !== x.unknown) { return ''; }
    return '<p class="path-nudge"><span data-say>' + esc(A.nudge) + '</span> ' + link(resHref('r4'), A.nudgeLink, 'tool') + '</p>';
  }

  /* 下一站：現在的階段的下一個（已經畢業的沒有）。升學＝換老師；高中職的下一站＝畢業之後（白天去哪裡） */
  function nextIndex() {
    var here = C.now.stages.indexOf(stageNow());
    return here >= 0 && here + 1 < C.now.stages.length ? here + 1 : -1;
  }
  function nextName() { return C.home.next.names[nextIndex()] || ''; }
  function nextView() {
    var N = C.home.next, k = nextIndex(), grad = k === C.now.stages.length - 1, li = function (t, more) { return '<li><span data-say>' + esc(t) + '</span>' + (more || '') + '</li>'; };
    var res = function (id) { var r = C.resources.items.filter(function (x) { return x.id === id; })[0]; return r ? link(resHref(id), r.icon + ' ' + r.when, 'tool') : ''; };
    /* 標題放在最上面看得到的地方；家下面那個大字 h1 在下一站時只給報讀器（同一句，不重複唸） */
    var h = '<div class="next-view"><p class="next-title" aria-hidden="true">' + esc(fill(N.title, { name: nextName() })) + '</p>';
    h += '<h2>' + esc(N.whoHead) + '</h2><p data-say>' + esc(grad ? N.whoGrad : N.who) + '</p>';
    if (grad) { h += futureDayLine() + pathCard(false); }
    h += '<h2>' + esc(N.doHead) + '</h2><ul class="next-do">' +
      li(grad ? N.doShareGrad : N.doShare, ' ' + link('#/out/day', N.shareLink, 'tool')) +
      (grad ? '' : li(fill(N.doMeet, { tag: C.ask.meetTag }), ' ' + link('#/steps', N.meetLink, 'tool'))) +
      (grad ? '' : li(N.doWhen)) + '</ul>';
    h += '<h2>' + esc(N.askHead) + '</h2><p class="next-ask">' + (grad ? res('r4') + ' ' + res('r5') : res('r3')) + '</p>';
    return h + '</div>';
  }

  /* 現在選的那個樣子：圖＋一句寫出名字的文字＋圖例（圖對報讀器隱藏，所以每個樣子都有文字） */
  function houseView(P) {
    var h = '';
    if (houseWhen === 'next') { return nextView(); }
    if (houseWhen === 'future' && houseMode === 'day') {
      var fd = futureDayView();
      h += house(fd.P, { tap: true, noLegend: true });
      h += fd.lit.length ? '<p class="sr" data-say="names">' + esc(fill(HS.futureDayWho, { names: fd.lit.join('、') })) + '</p>' : '';
      h += futureDayLine() || '<p class="sub center">' + esc(HS.futureDayNone) + '</p>';
      if (fd.seeking) { h += pathCard(false); }   /* 上面已經有「看白天有哪幾種地方」，卡片不再重複一顆 */
      if (ansOf('afterGrad').picks[0] === HS.futureDayHome && !fd.lit.length) { h += futureWhoLine([]); }
    } else if (houseWhen === 'future' && houseMode === 'night') {
      var fn = futureNightView();
      h += house(fn.P, { tap: true, night: true, other: !!fn.place, noLegend: true });
      if (fn.place) { h += '<p class="center" data-say>' + esc(fill(HS.futureLine, { place: fn.place })) + '</p>' + futureHolidayLine(); }
      h += fn.lit.length ? '<p class="sr" data-say="names">' + esc(fill(HS.futureNightWho, { names: fn.lit.join('、') })) + '</p>' : futureWhoLine([]);
      h += futureNightSee();   /* 2026-11-20 參賽者：白天有「看白天有哪幾種地方」，晚上也要有對應的「以後可以住哪些地方」 */
    } else if (houseMode === 'day') {
      var d = dayView(P);
      h += house(d.P, { tap: true, noLegend: true });   /* 首頁不放「怎麼看這些窗」（2026-11-18 參賽者） */
      /* 寫出名字的那幾句：畫面上不顯示（2026-11-18 參賽者：家的圖已經看得到），但圖對報讀器隱藏，所以留給報讀器和朗讀 */
      h += d.lit.length ? '<p class="sr" data-say="names">' + esc(fill(HS.dayLine, { names: d.lit.join('、') })) + '</p>' : askLine(HS.dayNone, 'day');
      h += midNote(d.P);
      if (isQ('afterGrad') && ansOf('day').picks[0] === HS.gradWhen && (HS.gradStages || []).indexOf(stageNow()) >= 0) {
        h += '<p class="center">' + link(hrefOf('afterGrad'), HS.gradAsk, 'tool') + '</p>';
      }
    } else if (houseMode === 'night') {
      var n = nightView(P);
      h += house(n.P, { tap: true, night: true, noLegend: true });
      h += n.lit.length ? '<p class="sr" data-say="names">' + esc(fill(HS.nightLine, { names: n.lit.join('、') })) + '</p>' : askLine(HS.nightNone, 'night');   /* 同上：只給報讀器 */
    } else if (houseWhen === 'future') {
      var fu = futureView();
      var dayPart = futurePlaceLine() + futureDayLine();
      if (movePlace()) {   /* 選了別的住處：另一棟房子 */
        h += '<p class="old-home">' + miniHome() + '<span>' + esc(HS.oldHome) + '</span><span class="arrow" aria-hidden="true">↓</span></p>';
        h += house(fu.P, { tap: true, other: true, noLegend: true });
        h += '<p class="center" data-say>' + esc(fill(HS.futureLine, { place: fu.place })) + '</p>' +
          futureWhoLine(fu.lit) + futureHolidayLine() + '<p class="center" data-say>' + esc(HS.futureNew) + '</p><p class="center">' + link('#/out/day', HS.futureLink, 'tool') + '</p>' + dayPart;
      } else if (HS.futureHome && ansOf('q8').picks.indexOf(HS.futureHome) >= 0) {   /* 選了住現在的家：同一棟家 */
        h += house(fu.P, { tap: true, noLegend: true }) + '<p class="center" data-say>' + esc(HS.futureSame) + '</p>' + futureWhoLine(fu.lit) + dayPart;
      } else {   /* 還沒答、還不知道：窗都空著 */
        h += house([], { noLegend: true }) + (isQ('q8') ? askLine(HS.futureUnknown, 'q8') : '<p class="sub center">' + esc(HS.futureUnknown) + '</p>') + dayPart;
      }
    } else {
      var on = P.filter(function (p) { return p.s === 'on'; }).length;
      h += house(P, { tap: true, noLegend: true, cap: on <= 1 ? C.circle.subOne : C.circle.sub }) + midNote(P);   /* 「空著的位置…」在房子下面（2026-11-18 參賽者） */
    }
    return h;   /* 「點一扇窗，看是誰」2026-11-18 參賽者要拿掉；窗本身是按鈕，報讀器會唸 */
  }

  /* 家下面那句大字：跟著現在看的樣子重新算。只算那個時候亮著的窗；那一題還沒答就說「還沒有說」 */
  function modeHeadline(P) {
    var n;
    if (houseWhen === 'next') { return fill(C.home.next.title, { name: nextName() }); }
    if (houseWhen === 'future' && houseMode === 'day') { n = futureDayView().lit.length; return n ? fill(HS.countFutureDay, { n: n }) : HS.futureDayNone; }
    if (houseWhen === 'future' && houseMode === 'night') { n = futureNightView().lit.length; return n ? fill(HS.countFutureNight, { n: n }) : HS.futureWhoNone; }
    if (houseMode === 'day') { n = dayView(P).lit.length; return n ? fill(HS.countDay, { n: n }) : HS.dayNone; }
    if (houseMode === 'night') { n = nightView(P).lit.length; return n ? fill(HS.countNight, { n: n }) : HS.nightNone; }
    if (houseWhen === 'future') { n = futureView().lit.length; return n ? fill(HS.countFuture, { n: n }) : (movePlace() || ansOf('q8').picks.indexOf(HS.futureHome) >= 0 ? HS.futureWhoNone : HS.futureUnknown); }
    return headline(P);
  }

  /* 家＋切換按鈕。按切換時只換 #house-view 裡面（見 switchMode），頁面其他部分不重畫 */
  function houseBlock(P) {
    var modes = modesNow();
    if (!modes.length) { return house(P); }
    if (modes.indexOf(houseMode) < 0) { houseMode = 'all'; }   /* 「以後」從上面的階段條切換（houseWhen） */
    return modeSwitch(modes).replace('<div class="modes"', '<div class="modes"' + (houseWhen === 'next' ? ' hidden' : '')) + '<div id="house-view" class="house-view" aria-live="polite">' + houseView(P) + '</div>';
  }

  /* m＝全部／白天／晚上；when＝現在／以後（沒給就不變） */
  function switchMode(m, when) {
    var box = $('house-view');
    if (!box) { return; }
    if (m) { houseMode = m; }
    if (when) { houseWhen = when; }
    m = houseMode;
    /* 舊版高度只增不減（免得下面往上跳），但白天／晚上的圖比較矮，房子和下面那句中間空一大塊——2026-11-18 參賽者要拿掉，改成跟著內容高度 */
    var P = people(), line = app.querySelector('.home h1.big-line');
    box.innerHTML = houseView(P);
    if (line) { line.textContent = modeHeadline(P); }   /* 人數那一句跟著換（同一個元素，只換字） */
    box.classList.remove('swap'); void box.offsetWidth; box.classList.add('swap');
    Array.prototype.forEach.call(app.querySelectorAll('.modes [data-m]'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-m') === m ? 'true' : 'false');
    });
    /* 階段條上的兩顆：現在的階段／以後 */
    Array.prototype.forEach.call(app.querySelectorAll('[data-when]'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-when') === houseWhen ? 'true' : 'false');
    });
    var hm = app.querySelector('.screen.home');
    if (hm) { hm.classList.toggle('is-next', houseWhen === 'next'); }
    var nu = app.querySelector('.path-nudge');
    if (nu) { nu.hidden = houseWhen !== 'now'; }   /* 首頁小卡只在看「現在」時出現（下一站、以後的畫面裡已經有那張卡） */
    var md = app.querySelector('.modes');
    if (md) { md.hidden = houseWhen === 'next'; }   /* 下一站不是一張家的圖，不需要全部／白天／晚上 */
  }

  /* 還沒說的題目，變成可以點的小標籤（最多 3 個，其餘收成「還有 N 題」連到全部的步驟） */
  function laterChips() {
    var all = unanswered(), list = all.slice(0, 3);
    if (!list.length) { return ''; }
    var h = '<nav class="later" aria-label="' + esc(F.later) + '"><p class="sub">' + esc(F.later) + '</p><ul class="chips">';
    list.forEach(function (n) { h += '<li>' + link(hrefOf(n), titleOf(n), 'chip-link') + '</li>'; });
    if (all.length > list.length) { h += '<li>' + link('#/steps', fill(C.home.moreSkipped, { n: all.length - list.length }), 'chip-link more') + '</li>'; }
    return h + '</ul></nav>';
  }

  /* --- 題目下面固定三顆：首頁｜先不答（有內容之後變成下一步）｜先到這裡 --- */

  /* 這一題現在有沒有內容（點了或寫了任何東西） */
  function hasContent() {
    if (route.name === 'now') { var k = NOW_PARTS[route.part]; return k === 'stage' ? !!(S.now.born || S.now.stage || S.now.stageText.trim()) : S.now[k].length > 0 || (k === 'care' && !!S.now.careText.trim()); }
    if (route.name === 'o') {
      if (route.node === 'others') { return S.flow.others.length > 0 || !!String(S.flow.othersText || '').trim(); }
      return route.node === 'origin' ? !!S.flow.origin : !!S.flow.worry;
    }
    if (route.name === 'q') {
      var x = Q[route.i], a = answer(x.id);
      if (x.kind === 'people') { return a.picks.length > 0 || !!a.text.trim(); }
      if (x.kind === 'choice') { return a.picks.length > 0; }
      if (!x.options) { return !!a.text.trim(); }
      return !!a.st;
    }
    return false;
  }

  function fwdInner(has) {
    return '<span>' + esc(has ? F.next : F.skip) + '</span><span aria-hidden="true">›</span>';
  }

  /* 從櫃子的一段（#/ch/day…）進來時，這一段的每一頁（「他現在的狀況」三小頁各算一頁） */
  function chapterPages(c) {
    var out = [];
    chapterNodes(c).forEach(function (n) {
      if (n === 'now') { NOW_PARTS.forEach(function (_, k) { out.push('#/now/' + k); }); } else { out.push(hrefOf(n)); }
    });
    return out;
  }
  function hereHref() { return route.name === 'now' ? '#/now/' + route.part : route.name === 'q' ? qHref(route.i) : ''; }

  function flowNav() {
    var has = hasContent(), A = C.app, m = /^#\/ch\/(\w+)$/.exec(returnTo || '');
    if (m) {   /* 2026-11-18 參賽者：櫃子進來的只在這一段裡前後走，中間回櫃子 */
      var pages = chapterPages(m[1]), at = pages.indexOf(hereHref());
      var side = function (k, cls, label, arrow, first) {
        return pages[k] ? '<a tabindex="0" class="navbtn ' + cls + '" data-nav="' + cls + '" href="' + pages[k] + '">' + (first ? arrow : '') + '<span>' + esc(label) + '</span>' + (first ? '' : arrow) + '</a>' : '<span aria-hidden="true"></span>';
      };
      return '<div class="flownav">' + side(at - 1, 'prevq', A.prevQ, '<span aria-hidden="true">‹</span>', true) +
        '<a tabindex="0" class="navbtn" data-nav="stop" href="' + esc(returnTo) + '">' + esc(A.backCabinet) + '</a>' +
        side(at < 0 ? -1 : at + 1, 'nextq', A.nextQ, '<span aria-hidden="true">›</span>', false) + '</div>';
    }
    return '<div class="flownav">' +
      '<a tabindex="0" class="navbtn" data-nav="home" href="#/home" aria-label="' + esc(A.toHome) + '"><span aria-hidden="true">🏠</span><span>' + esc(A.home) + '</span></a>' +
      '<button type="button" class="navbtn fwd' + (has ? ' go' : '') + '" data-act="fwd"' + (has ? '' : ' aria-label="' + esc(F.skipFull) + '"') + '>' + fwdInner(has) + '</button>' +
      (returnTo ? '<a tabindex="0" class="navbtn" data-nav="stop" href="' + esc(returnTo) + '">' + esc(A.backCabinet) + '</a></div>'
        : '<a tabindex="0" class="navbtn" data-nav="stop" href="#/stop">' + esc(A.stop) + '</a></div>');
  }

  /* 點了、取消了、打了字之後，中間那顆的字跟著換（位置不變、不搬焦點） */
  function updateFwd() {
    var b = app.querySelector('.navbtn.fwd');
    if (!b) { return; }
    var has = hasContent();
    if (b.classList.contains('go') === has) { return; }
    b.classList.toggle('go', has);
    if (has) { b.removeAttribute('aria-label'); } else { b.setAttribute('aria-label', F.skipFull); }
    b.innerHTML = fwdInner(has);
  }

  /* 一排大按鈕的選項（原點那一題、「最常想到哪一件」用） */
  function bigOptions(act, options, chosen) {
    /* 選項多的時候按鈕收矮一點；超過 6 個排成兩欄，讓整題留在一屏裡 */
    var h = '<div class="choices' + (options.length > 4 ? ' many' : '') + (options.length > 6 ? ' grid2' : '') + '">';
    options.forEach(function (o, k) {
      var isOn = chosen !== '' && (chosen === o.value || chosen === o.text);
      h += '<button type="button" class="choice' + (isOn ? ' is-on' : '') + '" data-act="' + act + '" data-k="' + k + '">' +
        (o.icon ? '<span class="ico-dot" aria-hidden="true">' + esc(o.icon) + '</span>' : '') + '<span data-say>' + esc(o.text) + '</span>' +
        (o.desc ? '<span class="opt-desc">' + esc(o.desc) + '</span>' : '') +
        (isOn ? '<span class="chosen">✓ ' + esc(C.ask.chosen) + '</span>' : '') + '</button>';
    });
    return h + '</div>';
  }

  /* --- 原點：他現在，有人陪嗎？（第一次打開就是這個畫面） --- */

  /* 第一次打開的首頁：只有家（空的）、一句話、一顆「開始填寫」 */
  function viewWelcome() {
    var H = C.home;
    return '<div class="screen home welcome">' + house([]) +
      '<h1 class="big-line center" tabindex="-1">' + esc(H.welcomeTitle) + '</h1>' +
      '<p class="sub center" data-say>' + esc(H.welcomeSub) + '</p>' +
      '<a tabindex="0" class="btn primary two" href="' + hrefOf(firstOpen() || 'now') + '"><span>' + esc(H.start) + '</span><span class="btn-sub">' + esc(H.startSub) + '</span></a>' +
      '<p class="sub center" data-say>' + esc(H.firstNote) + '</p></div>';
  }

  /* 第一題：和其他題目同一種畫面（沒有家的圖） */
  function viewOrigin() {
    var o = F.origin;
    return '<div class="screen"><h1 tabindex="-1">' + esc(o.q) + '</h1>' + bigOptions('origin', o.options, S.flow.origin) + flowNav() + '</div>';
  }

  /* --- 還有誰在陪他？ --- */

  function viewOthers() {
    var o = F.others;
    var h = '<div class="screen">' + '<h1 tabindex="-1">' + esc(o.q) + '</h1><p class="sub" data-say>' + esc(o.hint) + '</p>' +
      '<fieldset><legend class="sr">' + esc(o.q) + '</legend><div class="picks">';
    C.now.care.forEach(function (t) {
      h += pick({ type: 'checkbox', name: 'others', cls: 'tile', value: t[1], label: t[1], icon: t[0], on: S.flow.others.indexOf(t[1]) >= 0 });
    });
    h += '</div></fieldset>' + textField('f-others', o.customLabel, S.flow.othersText, 'short') +
      flowNav() + '</div>';
    return h;
  }

  /* --- 你最常想到的是哪一件？ --- */

  function viewWorry() {
    var o = F.worry;
    return '<div class="screen"><h1 tabindex="-1">' + esc(o.q) + '</h1><p class="sub" data-say>' + esc(o.hint) + '</p>' +
      bigOptions('worry', o.options, S.flow.worry) + flowNav() + '</div>';
  }

  /* --- 首頁最上面的階段條：他現在走到哪一個階段（只顯示填的內容，不計算、不預測） --- */

  function stageStrip() {
    var H = C.home, stages = C.now.stages, short = H.stageShort || stages, cur = stageNow(), here = stages.indexOf(cur), born = bornYear();
    /* 階段條是時間軸：現在的階段（大圓點，按了看現在的家）……最後一格「以後」（按了看以後的家）。
       其他階段只是標示、不能按（2026-11-18 參賽者：改階段統一在家裡點「他」→「更新」） */
    var h = '<div class="stages" role="group" aria-label="' + esc(H.stageLabel) + '"><span class="stage-strip">';
    var rest = [];
    stages.forEach(function (t, k) {
      if (here >= 0 && k < here) { return; }   /* 2026-11-18 參賽者：只從現在的階段往後列，走過的不顯示（要改回以前的階段走「更新」） */
      var inner = '<i aria-hidden="true"></i><b>' + esc(short[k] || t) + '</b>';
      if (k === here) {
        h += '<button type="button" class="stage here" data-act="when" data-when="now" aria-pressed="' + (houseWhen === 'now' ? 'true' : 'false') + '">' + inner + '<span class="sr">' + esc(H.stageHereSr) + '</span></button>';
      } else if (here >= 0 && k === here + 1) {   /* 2026-11-20 參賽者：下一站可以按（換一批人陪他） */
        h += '<button type="button" class="stage next" data-act="when" data-when="next" aria-pressed="' + (houseWhen === 'next' ? 'true' : 'false') + '">' + inner +
          '<small>' + esc(H.next.tag) + '</small><span class="sr">' + esc(H.next.sr) + '</span></button>';
      } else if (here >= 0) {
        rest.push(short[k] || t);   /* 更後面的：一行淡字，不畫圓點、不像按鈕 */
      } else {
        h += '<span class="stage">' + inner + '</span>';
      }
    });
    if (rest.length) { h += '<span class="stage rest">' + esc(rest.join('・')) + '</span>'; }
    h += '<button type="button" class="stage later" data-act="when" data-when="future" aria-pressed="' + (houseWhen === 'future' ? 'true' : 'false') + '"><i aria-hidden="true"></i><b>' + esc(HS.modeFuture) + '</b></button></span></div>';
    var info = stageInfo();
    return h + (info.show ? '<p class="stage-line">' + info.html + '</p>' : '');   /* 還沒填、太久沒更新才留在首頁；其他時候點家裡的「他」看 */
  }

  /* 他現在大約在哪個階段、幾歲＋「更新」（首頁那一行和點「他」的小視窗共用） */
  function stageInfo(btnCls) {
    var H = C.home, cur = stageNow(), here = C.now.stages.indexOf(cur), born = bornYear(), stale = false;
    var line = here < 0 ? H.stageNone : fill(born ? H.stageLineBorn : H.stageLine, { stage: cur }), when = '';
    var m = /^(\d{4})-(\d{1,2})$/.exec(S.now.at || '');
    if (born) {   /* 照出生年推的：每年自己往前走，不用提醒更新 */
      when = esc(fill(H.stageAgeBorn, { age: ageNow() }) + (S.now.shift ? '・' + H.stageFixed : ''));
    } else if (here >= 0 && m) {
      var t = new Date(), months = (t.getFullYear() - +m[1]) * 12 + (t.getMonth() + 1 - +m[2]);
      stale = months >= (H.stageStaleMonths || 12);
      when = stale ? '<b class="stale">' + esc(H.stageStale) + '</b>' : esc(fill(H.stageFilled, { y: m[1], m: m[2] }));
    }
    return { show: here < 0 || stale, text: line,
      html: '<span class="stage-text" data-say>' + esc(line) + (when ? '<span>（' + when + '）</span>' : '') + '</span>' +
        link('#/now/0', here >= 0 ? H.stageEdit : H.stageFill, (btnCls || 'tool') + ' stage-edit') };
  }

  /* --- 首頁：一棟家＋一顆「接著說」 --- */

  function viewHome() {
    if (!started()) { return viewWelcome(); }   /* 第一次打開：只有家和「開始填寫」 */
    var H = C.home, K = C.circle, O = C.out, P = people(), next = nextUnfinished();
    var on = P.filter(function (p) { return p.s === 'on'; }).length;
    var h = '<div class="screen home' + (houseWhen === 'next' ? ' is-next' : '') + '"><div id="stage-box">' + stageStrip() + '</div>' + houseBlock(P) +
      '<h1 class="big-line" tabindex="-1" aria-live="polite">' + esc(modeHeadline(P)) + '</h1>' + pathNudge();
    if (next) {
      var ch = chapterName(chapterOf(next.node));
      h += '<a tabindex="0" class="btn primary two" href="' + next.href + '"><span>' + esc(H.goOn) + '</span>' +
        '<span class="btn-sub">' + esc((ch ? fill(H.nextChapter, { chapter: ch }) : '') + fill(H.nextIs, { title: next.title })) + '</span></a>';
    } else {
      h += link('#/out/day', K.toOutDay, 'btn primary');
    }
    /* 整理好的內容收在另一頁「家裡的櫃子」（最上面那一排切換），首頁只留家和下一步 */
    h += laterChips() +
      '<div class="clear-box">' + button('clear', C.app.clearShort, 'tool') + '</div>' +
      '<p class="foot">' + esc(C.app.footer) + '</p></div>';
    return h;
  }

  /* --- 家裡的櫃子：一格一個整理好的頁面（首頁是家的外面，這裡是裡面） --- */

  function viewInside() {
    var I = C.inside, K = C.circle, H = C.home, O = C.out;
    /* 2026-11-18 參賽者：櫃子照四段放（點了看那一段每一題填了什麼），再加「怎麼陪我」；
       原本的陪伴他的人、還沒有答案的事、全部的步驟拿掉（網址還打得開） */
    /* 2026-11-20 參賽者：「怎麼陪我（可列印）」併進「怎麼陪他」；最後一格把全部的內容一次傳出或列印 */
    var items = CHAPTERS.map(function (c) { return [(C.tiles.chapterIcons || {})[c] || '', '#/ch/' + c, chapterName(c)]; }).concat([[C.tiles.allIcon || '', '#/out/all', I.allTile, I.allTileSub]]);
    var h = '<div class="screen"><h1 tabindex="-1">' + esc(I.title) + '</h1><p class="sub" data-say>' + esc(I.intro) + '</p><ul class="cabinet">';
    items.forEach(function (t) {
      /* 2026-11-20 參賽者：有「開會時可以和老師一起填」題目的那一段，櫃子這一層就看得到標籤，不用點進去 */
      var meet = Q.some(function (q) { return q.meet && t[1] === '#/ch/' + (q.chapter || q.layer); });
      h += '<li><a tabindex="0" class="drawer" href="' + t[1] + '"><span class="ico" aria-hidden="true">' + t[0] + '</span><span>' + esc(t[2]) + '</span>' + (t[3] ? '<span class="drawer-sub">' + esc(t[3]) + '</span>' : '') +
        (meet ? '<span class="tag meet">' + esc(C.ask.meetTag) + '</span>' : '') + '</a></li>';
    });
    return h + '</ul></div>';
  }

  /* --- 全部的步驟（圓點步道） --- */

  function step(href, label, st) {
    var text = st === 'end' ? '' : (st === 'ok' ? C.status.filled : stateText(st));
    var edit = st && st !== 'end' && C.home.stepEdit;   /* 填過的：右邊多一個「修改 ›」 */
    return '<li><a tabindex="0" class="stp" href="' + href + '"><span class="dot ' + (st || '') + '" aria-hidden="true"></span>' +
      '<span class="stp-name">' + esc(label) + '</span>' +
      (text ? '<span class="stp-st">' + esc(text) + '</span>' : '') +
      (edit ? '<span class="stp-edit">' + esc(C.home.stepEdit) + ' <span aria-hidden="true">›</span></span>' : '') + '</a></li>';
  }

  /* 一段：標題後面寫「答了幾題，共幾題」；可以收合，預設只展開下一題所在的那一段 */
  function stepGroup(c, open) {
    var rows = '', n = 0, total = 0;
    function add(href, label, st, ok) { rows += step(href, label, st); total++; if (ok) { n++; } }
    if (c === 'know') {
      if (F.origin) { add('#/o/origin', F.stepOrigin || F.origin.q, S.flow.origin ? 'ok' : '', !!S.flow.origin); }
      add('#/now/0', C.home.stepNow, nowFilled() ? 'ok' : '', nowFilled());
    }
    Q.forEach(function (x, i) {
      if (chapterOf(codeOf(x)) !== c) { return; }
      var st = answer(x.id).st;
      add(qHref(i), x.title, x.kind ? (st ? 'ok' : '') : st, !!st);
    });
    if (!total) { return ''; }
    return '<details class="grp-box"' + (open ? ' open' : '') + '><summary><h2 class="grp">' + esc(chapterName(c)) + '</h2>' +
      '<span class="grp-count">' + esc(fill(C.home.groupCount, { n: n, total: total })) + '</span></summary><ol class="path">' + rows + '</ol></details>';
  }

  function viewSteps() {
    var H = C.home, next = nextUnfinished(), openCh = next ? (chapterOf(next.node) || 'know') : '';
    var h = '<div class="screen"><h1 tabindex="-1">' + esc(H.stepsTitle) + '</h1><p class="sub" data-say>' + esc(H.intro) + '</p>' +
      '<nav aria-label="' + esc(H.pathLabel) + '">';
    CHAPTERS.forEach(function (c) { h += stepGroup(c, c === openCh); });
    return h + '</nav></div>';   /* 整理好的頁面都在「櫃子」那一頁，這裡只列題目 */
  }

  /* --- 他現在的狀況：三個畫面，一個畫面一個問題 --- */

  function viewNow(part) {
    var N = C.now, key = NOW_PARTS[part];
    var question = [N.stageQ, N.careQ, N.helpQ][part], hint = [N.stageHint, N.careHint, N.helpHint][part];
    var h = '<div class="screen">' + eyebrow(N.title) + '<h1 tabindex="-1">' + esc(question) + '</h1>' +
      '<p class="sub" data-say>' + esc(hint) + '</p>' +
      '<fieldset><legend class="sr">' + esc(question) + '</legend>';
    if (key === 'stage') {   /* 出生年（選單）；下面收著「直接選階段」 */
      var roc = new Date().getFullYear() - 1911, cur = stageNow();
      h = h.slice(0, h.lastIndexOf('<fieldset>'));
      h += '<label class="field" for="born">' + esc(N.bornLabel) + '</label><select id="born" class="big-select"><option value="">' + esc(N.bornPick) + '</option>';
      for (var y = roc; y >= roc - (N.bornRange || 80); y--) {
        h += '<option value="' + y + '"' + (S.now.born === String(y) ? ' selected' : '') + '>' + esc(fill(N.bornYear, { y: y, age: roc - y })) + '</option>';
      }
      h += '<option value="no"' + (S.now.born === 'no' ? ' selected' : '') + '>' + esc(N.bornNo) + '</option></select>' +
        (bornYear() && cur ? '<p class="big-line" data-say>' + esc(fill(N.bornResult, { age: ageNow(), stage: cur })) + '</p>' : '') +
        '<details class="stage-fix"' + (S.now.born === 'no' ? ' open' : '') + '><summary>' + esc(N.stageFix) + '</summary>' +
        '<fieldset><legend class="sr">' + esc(N.stagePickQ) + '</legend><div class="picks list">';
      N.stages.forEach(function (t) { h += pick({ type: 'radio', name: 'stage', cls: 'row-pick', value: t, label: t, on: cur === t }); });
      return h + '</div></fieldset></details>' + writeMore('now-stage', N.stageTextLabel, S.now.stageText) + flowNav() + '</div>';
    } else {
      h += '<div class="picks">';
      N[key].forEach(function (t) {
        h += pick({ type: 'checkbox', name: key, cls: 'tile', value: t[1], label: t[1], icon: t[0], on: S.now[key].indexOf(t[1]) >= 0 });
      });
    }
    h += '</div></fieldset>';
    h += '<div class="notes" id="notes">' + nowNotes(key) + '</div>';   /* 每個選項的補充（和題目一樣：一個框，寫最後勾的那一個） */
    if (key === 'care') { h += writeMore('now-care', N.careTextLabel, S.now.careText); }
    if (key === 'help') {
      h += '<details><summary>' + esc(N.why) + '</summary><p class="sub">' + esc(N.helpWhy) + '</p></details>';
    }
    return h + flowNav() + '</div>';
  }

  /* 「他現在的狀況」第二、三頁的補充框：照顧的人、需要幫忙的事 */
  function nowNotes(key) {
    if (key !== 'care' && key !== 'help') { return ''; }
    return noteBox(C.now[key].map(function (t) { return t[1]; }), S.now[key], S.now[key + 'Notes']);
  }

  /* 收著的「想多寫一點」 */
  function writeMore(id, label, value) {
    return '<details' + (value ? ' open' : '') + '><summary>' + esc(C.ask.writeMore) + '</summary>' + textField(id, label, value) + '</details>';
  }

  /* --- 每一題，第一個畫面：只問狀態 --- */

  /* 圓圈像單選鈕：選了的那一顆實心，其他（含還沒選）都是空心（2026-11-18 參賽者） */

  /* 開會時可以和老師一起填（2026-11-20 參賽者）；畫面上看得到，傳出去、列印時不出現 */
  function meetTag(x) { return x && x.meet ? '<span class="tag meet noprint">' + esc(C.ask.meetTag) + '</span>' : ''; }

  function layerTag(x) {
    var t = (x.who === 'me' ? '<span class="tag me">' + esc(C.ask.selfTag) + '</span>' : '') + meetTag(x);
    return t ? '<p class="eyebrow">' + t + '</p>' : '';
  }

  function whyBox(x) {
    return x.why ? '<details><summary>' + esc(C.now.why) + '</summary><p class="sub">' + esc(x.why) + '</p></details>' : '';
  }

  /* --- 每一題只有一頁（2026-11-18 參賽者：不要跳到下一頁）：
     上面選狀態；選了「想好了」那一類，同一頁下面出現選項和輸入框；選了「還沒想」，下面出現可以先做的一小步。
     沒有選項的題目（想說的一句話）不問狀態，直接寫。 --- */

  function statesOf(x) {
    return ['done', 'half', 'none'].filter(function (s) { return x.answers ? !!x.answers[s] : (C.status.choices || ['done', 'none']).indexOf(s) >= 0; });
  }

  function viewStatus(i) {
    var x = Q[i], a = answer(x.id), A = C.ask;
    if (x.kind === 'choice') { return viewChoice(i); }
    if (x.kind === 'people') { return viewPeople(i); }
    if (!x.options) {   /* 只有一格字：不問狀態 */
      return '<div class="screen">' + layerTag(x) + '<h1 tabindex="-1">' + esc(x.q) + '</h1><p class="sub" data-say>' + esc(x.hint) + '</p>' +
        textField('f-text', A.textLabel, a.text) + flowNav() + '</div>';
    }
    var h = '<div class="screen">' + layerTag(x) + '<h1 class="huge" tabindex="-1">' + esc(x.short || x.q) + '</h1>' +
      (x.lead ? '<p class="lead-note" data-say>' + esc(x.lead) + '</p>' : '') +   /* 題目自己的一段說明，一直看得到 */
      '<p class="sub" data-say>' + esc(A.statusQ) + '</p><div class="choices">';
    /* 給哪幾個答案選：題目自己寫了 answers 就照它寫的；沒寫就用 content.js 的 status.choices */
    statesOf(x).forEach(function (s) {
      var label = (x.answers && x.answers[s]) || C.status[s];   /* 這一題有自己的說法就用它 */
      h += '<button type="button" class="choice' + (a.st === s ? ' is-on' : '') + '" data-act="status" data-s="' + s + '" aria-pressed="' + (a.st === s) + '">' +
        '<span class="mark" aria-hidden="true">' + (a.st === s ? '●' : '○') + '</span><span data-say>' + esc(label) + '</span>' +
        (a.st === s ? '<span class="chosen">✓ ' + esc(A.chosen) + '</span>' : '') + '</button>';
    });
    h += '</div>' + whyBox(x);
    if (a.st === 'done' || a.st === 'half') { h += answerPart(x, a); }
    else if (a.st === 'none' && x.ask) { h += '<p class="notice reveal" id="reveal" data-say>' + esc(A.noneTip) + esc(x.ask) + '</p>'; }
    return h + flowNav() + '</div>';
  }

    /* --- 第四版的題型：點一個就記下（年齡、白天在哪裡…）。答案只用來決定下一題，不計算、不評分 --- */

  function viewChoice(i) {
    var x = Q[i], a = answer(x.id);
    var opts = x.options.map(function (t) { return { icon: t[0], text: t[1], desc: t[2] || '' }; });
    return '<div class="screen' + (x.see ? ' tight' : '') + '">' + layerTag(x) + '<h1 tabindex="-1">' + esc(x.q) + '</h1><p class="sub" data-say>' + esc(x.hint || '') + '</p>' +
      bigOptions('choice', opts, a.picks[0] || '') + subPart(x, a) + whyBox(x) +
      (x.see ? '<p class="center see">' + link(resHref(x.see), x.seeText || C.ask.seeLink, 'tool') + '</p>' : '') + flowNav() + '</div>';
  }

  /* 選擇題點了一個之後，同一頁下面接著問的第二層（content.js 的 sub） */
  function subPart(x, a) {
    var sub = x.sub && a.picks[0] ? x.sub[a.picks[0]] : null;
    if (!sub) { return ''; }
    if (sub.text) { return '<div class="reveal" id="reveal">' + textField('f-text', sub.text, a.text, 'short') + '</div>'; }
    var h = '<div class="reveal" id="reveal"><fieldset><legend class="field">' + esc(sub.q) + '</legend><div class="picks">';
    sub.options.forEach(function (t) { h += pick({ type: 'radio', name: 'sub', cls: 'tile', value: t, label: t, icon: '', on: a.sub === t }); });
    return h + '</div></fieldset></div>';
  }

  /* --- 第四版的題型：點人物（晚上誰陪他、假日誰陪他） --- */

  function viewPeople(i) {
    var x = Q[i], a = answer(x.id);
    var h = '<div class="screen">' + layerTag(x) + '<h1 tabindex="-1">' + esc(x.q) + '</h1><p class="sub" data-say>' + esc(x.hint || '') + '</p>' +
      '<fieldset><legend class="sr">' + esc(x.q) + '</legend><div class="picks">';
    C.now.care.concat(x.extra || []).forEach(function (t) {
      h += pick({ type: 'checkbox', name: 'picks', cls: 'tile', value: t[1], label: t[1], icon: t[0], on: a.picks.indexOf(t[1]) >= 0 });
    });
    return h + '</div></fieldset>' + noteFields(x, a) + textField('f-text', F.peopleCustom, a.text, 'short') + whyBox(x) +
      flowNav() + '</div>';
  }

  /* --- 每一題，第二個畫面：先用點的，想寫再寫 --- */

  /* 狀態下面展開的那一塊：先用點的，想寫再寫 */
  function answerPart(x, a) {
    var A = C.ask;
    var h = '<div class="reveal" id="reveal">' + (x.short ? '<h2 class="small-title">' + esc(x.q) + '</h2>' : '') + '<p class="sub" data-say>' + esc(x.hint) + '</p>';
    h += '<fieldset><legend class="sr">' + esc(A.optionsLegend) + '</legend><div class="picks">';
    x.options.forEach(function (t) {
      h += pick({ type: 'checkbox', name: 'picks', cls: 'tile', value: t[1], label: t[1], icon: t[0], on: a.picks.indexOf(t[1]) >= 0 });
    });
    h += '</div></fieldset>' + noteFields(x, a);
    if (x.more) {   /* 第二組選項（可以不選） */
      h += '<fieldset><legend class="field">' + esc(x.more.label) + '</legend><div class="picks">';
      x.more.options.forEach(function (t) {
        h += pick({ type: 'checkbox', name: 'picks2', cls: 'tile', value: t[1], label: t[1], icon: t[0], on: a.picks2.indexOf(t[1]) >= 0 });
      });
      h += '</div></fieldset>';
    }
    /* 文字是備用的：收著，想寫再打開 */
    h += '<details' + (a.text ? ' open' : '') + '><summary>' + esc(A.writeMore) + '</summary>' +
      textField('f-text', x.textLabel || A.textLabelWithOptions, a.text) + '</details>';
    return h + '</div>';   /* 「更多（可以不填）」那一塊 2026-11-18 參賽者拿掉，只留「想多寫一點」 */
  }

  /* 每個選項自己的補充：同一時間只有一個框，固定在圖卡下面（2026-11-18 參賽者：框一個一個往下疊，越後點的離越遠）。
     框寫的是「最後點的那一個」；勾了兩個以上，框上面一排小按鈕可以換補充哪一個。
     點已勾的圖卡＝取消（和原本一樣），所以換框不用點圖卡、用那排小按鈕。取消勾選時寫過的字留著，再勾回來還在。 */
  var noteActive = '';
  /* 2026-11-18 參賽者：每一題有選項的都可以補充（題目寫 notes: false 才不出現）；「一種人」（nameFor）的框寫稱呼 */
  function noteOn(x) { return x.notes !== undefined ? !!x.notes : true; }
  function optTexts(x) { return (x.kind === 'people' ? C.now.care.concat(x.extra || []) : x.options).map(function (t) { return t[1]; }); }
  function notePicks(x, a) {
    return optTexts(x).filter(function (k) { return a.picks.indexOf(k) >= 0 && (noteOn(x) || (x.nameFor || []).indexOf(k) >= 0); });
  }
  function noteFields(x, a) {
    if (!noteOn(x) && !x.nameFor) { return ''; }
    return '<div class="notes" id="notes">' + noteInner(x, a) + '</div>';
  }
  function noteInner(x, a) { return noteBox(notePicks(x, a), a.picks, a.notes, a.names, x.nameFor); }
  /* opts＝可以補充的選項（照選項順序）；picks＝勾的順序（找最後勾的）；notes＝寫過的補充；
     names、nameFor＝「一種人」的選項寫的是稱呼（存在 names），框的說明也換成「…的稱呼」 */
  function noteBox(opts, picks, notes, names, nameFor) {
    var list = opts.filter(function (k) { return picks.indexOf(k) >= 0; });
    var isName = function (k) { return (nameFor || []).indexOf(k) >= 0; };
    var val = function (k) { return String((isName(k) ? (names || {})[k] : notes[k]) || ''); };
    if (list.indexOf(noteActive) < 0) { noteActive = picks.filter(function (k) { return list.indexOf(k) >= 0; }).pop() || ''; }   /* 沒指定＝最後勾的那一個 */
    if (!noteActive) { return ''; }
    var h = '';
    if (list.length > 1) {
      h += '<div class="note-tabs" role="group" aria-label="' + esc(C.ask.noteSwitch) + '"><span class="sub">' + esc(C.ask.noteSwitch) + '</span>';
      list.forEach(function (k) {
        var on = k === noteActive, has = val(k).trim();
        h += '<button type="button" class="tool note-tab" data-act="noteTab" data-k="' + esc(k) + '" aria-pressed="' + on + '">' + esc(k) +
          (has ? '<span aria-hidden="true"> ✎</span><span class="sr">' + esc(C.ask.noteHas) + '</span>' : '') + '</button>';
      });
      h += '</div>';
    }
    var nm = isName(noteActive);
    return h + '<label class="field" for="nt">' + esc(fill(nm ? C.ask.nameLabel : C.ask.noteLabel, { pick: noteActive })) + '</label>' +
      '<textarea id="nt" class="short" data-' + (nm ? 'pick' : 'note') + '="' + esc(noteActive) + '">' + esc(val(noteActive)) + '</textarea>';
  }
  function redrawNotes(focusBox) {
    var box = $('notes');
    if (!box) { return; }
    if (route.name === 'now') { box.innerHTML = nowNotes(NOW_PARTS[route.part]); }
    else { var x = Q[route.i]; box.innerHTML = noteInner(x, answer(x.id)); }
    if (focusBox && $('nt')) { $('nt').focus(); }
  }

  /* --- 按「先到這裡」之後 --- */

  function viewStop() {
    var T = C.stop, P = people(), next = nextUnfinished();
    return '<div class="screen stop"><h1 class="huge" tabindex="-1">' + esc(T.title) + '</h1>' +
      '<p class="big-line" data-say>' + esc(next ? fill(T.nextTime, { title: next.title }) : T.allDone) + '</p>' +
      house(started() ? P : [], true) + '<p class="sub" data-say>' + esc(headline(P)) + '</p>' + laterChips() +
      actions(link('#/home', T.home, 'btn primary')) + '</div>';
  }

  /* --- 櫃子裡的頁面共用：圖示格子，點一格在下面打開內容（和「可以找誰」同一個樣子） ---
     items：[{ id, icon, label, badge（格子下面的小字）, badgeCls, dim（還沒填：淡一點）, detail（點開後的 HTML） }]
     打開哪一格只記在這一次開啟裡（和「可以找誰」一樣） */
  var tileOpen = {}, tileHtml = {};

  function tileGrid(page, label, items) {
    var map = {}, open = tileOpen[page] || '';
    items.forEach(function (t) { map[t.id] = t.detail; });
    if (!Object.prototype.hasOwnProperty.call(map, open)) { open = tileOpen[page] = ''; }
    tileHtml[page] = map;
    var h = '<div class="res-grid tile-grid noprint" role="group" aria-label="' + esc(label) + '">';
    items.forEach(function (t) {
      var on = open === t.id;
      h += '<button type="button" class="res-tile' + (t.dim ? ' dim' : '') + (on ? ' is-on' : '') + '" data-act="tile" data-page="' + page + '" data-id="' + esc(t.id) + '" aria-expanded="' + (on ? 'true' : 'false') + '" aria-controls="tile-' + page + '">' +
        '<span class="ico" aria-hidden="true">' + esc(t.icon || '') + '</span><span class="tile-name">' + esc(t.label) + '</span>' +
        (t.badge ? '<span class="tile-badge' + (t.badgeCls ? ' ' + t.badgeCls : '') + '">' + esc(t.badge) + '</span>' : '') + '</button>';
    });
    return h + '</div><div id="tile-' + page + '" class="res-detail tile-detail noprint" aria-live="polite">' + (open ? map[open] : '<p class="sub">' + esc(C.tiles.pickHint) + '</p>') + '</div>';
  }

  function openTile(page, id) {
    tileOpen[page] = tileOpen[page] === id ? '' : id;
    var box = $('tile-' + page), open = tileOpen[page];
    if (!box) { return; }
    box.innerHTML = open ? (tileHtml[page] || {})[open] || '' : '<p class="sub">' + esc(C.tiles.pickHint) + '</p>';
    Array.prototype.forEach.call(app.querySelectorAll('[data-act=tile][data-page="' + page + '"]'), function (b) {
      var on = b.getAttribute('data-id') === open;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-expanded', on ? 'true' : 'false');
    });
    if (open && box.scrollIntoView) { box.scrollIntoView({ block: 'nearest' }); }
  }

  /* 格子點開後的標題＋右邊一顆「編輯」（2026-11-18 參賽者：櫃子裡每一頁都要有） */
  function editHead(title, href, tag) {
    tag = tag || 'h2';
    return '<div class="who-head"><' + tag + '>' + esc(title) + '</' + tag + '>' +
      (href ? '<a tabindex="0" class="tool who-edit" href="' + href + '">' + esc(C.circle.edit) + '<span class="sr">：' + esc(title) + '</span></a>' : '') + '</div>';
  }

  /* 還沒填的格子點開後：一句「還沒填」＋去填寫 */
  function fillLink(href, title, why) {
    return '<p class="who-why">' + esc(why || C.tiles.empty) + '</p><p>' + '<a tabindex="0" class="tool" href="' + href + '">' + esc(C.tiles.fill) + '<span class="sr">：' + esc(title) + '</span></a></p>';
  }

  /* --- 陪伴圈，一個一個看 --- */

  /* 「家人說／老師說」整理成一段。fam=true 才標是誰說的 */
  function answerBody(a, fam, x) {
    var s = '';
    if (a.picks.length) {
      s += esc(a.picks.map(function (k) {
        var n = String(a.names[k] || '').trim(), t = String(a.notes[k] || '').trim();
        if (n && x && (x.nameFor || []).indexOf(k) >= 0) { return k + '（' + n + '）'; }   /* 勾了人又寫了稱呼：兄弟姊妹（哥哥） */
        return t && x && noteOn(x) ? k + '（' + t + '）' : k;   /* 勾了又寫了補充：用說的（會說「要」） */
      }).join('、'));
    }
    if (a.picks2.length && x && x.more) { s += (s ? '<br>' : '') + '<span class="sub">' + esc(x.more.label) + '</span>' + esc(a.picks2.join('、')); }
    if (a.text) { s += (s ? '<br>' : '') + (fam && a.tch ? '<span class="sub">' + esc(C.out.familySays) + '</span>' : '') + lines(a.text); }
    if (fam && a.tch) { s += (s ? '<br>' : '') + '<span class="sub">' + esc(C.out.teacherSays) + '</span>' + lines(a.tch); }
    return s;
  }

  /* 陪伴他的人（自己一頁）：一個人一格（圖示＋名字＋狀態），點了看為什麼、去這一步。
     完整清單留在 print-only（列印時一次全部列出） */
  function personIcon(p) {
    var T = C.tiles, hit = '';
    if (p.n === C.circle.you) { return T.youIcon; }
    C.now.care.forEach(function (t) { if (t[1] === p.n && t[0]) { hit = t[0]; } });
    Q.forEach(function (x) { if (x.circleName === p.n && x.icon) { hit = x.icon; } });
    return hit || T.stateIcons[p.s] || '';
  }

  function viewWho() {
    var K = C.circle, P = people(), rows = '', items = [];
    P.forEach(function (p, i) {
      var st = '<p class="who-state"><span class="swatch ' + p.s + '" aria-hidden="true"></span>' + esc(stateName(p.s)) + '</p>';
      var why = '<p class="who-why">' + esc(p.why) + '</p>';
      rows += '<li class="row"><p><b>' + esc(p.n) + '</b></p>' + st + why + '</li>';   /* 紙本照樣每個人寫狀態 */
      /* 2026-11-18 參賽者：畫面上「已經在陪」不用寫，還空著、還沒講好才寫；點開右邊一顆「編輯」去改 */
      var edit = p.go ? '<a tabindex="0" class="tool who-edit" href="' + p.go + '">' + esc(p.s === 'on' ? K.edit : K.goStep) + '<span class="sr">：' + esc(p.n) + '</span></a>' : '';
      items.push({ id: 'p' + i, icon: personIcon(p), label: p.n, badge: p.s === 'on' ? '' : stateName(p.s), badgeCls: 'st-' + p.s, dim: p.s === 'off',
        detail: '<div class="who-head"><h2>' + esc(p.n) + '</h2>' + edit + '</div>' + (p.s === 'on' ? '' : st) + why });
    });
    return '<div class="screen"><h1 tabindex="-1">' + esc(K.listTitle) + '</h1><p class="sub" data-say>' + esc(headline(P)) + '</p>' +
      tileGrid('who', K.listTitle, items) + '<ul class="rows print-only">' + rows + '</ul></div>';
  }

  /* 準備到哪裡了（自己一頁）：照四段把每一題列出來。說過的＝直接寫出填的內容；還沒說的＝一顆去填寫的按鈕。
     只整理填的內容，不打分數；最下面那一句「不是評分」留在這一頁 */

  /* 某一題填了什麼（一小段 HTML）；沒有內容回空字串 */
  function summaryOf(node) {
    var K = C.circle, parts = [];
    if (node === 'now') {
      if (stageNow()) { parts.push(esc(stageNow() + (bornYear() ? '（' + fill(C.home.stageAgeBorn, { age: ageNow() }) + '）' : ''))); }
      if (S.now.stageText.trim()) { parts.push(lines(S.now.stageText.trim())); }
      if (S.now.care.length) { parts.push(esc(K.sumCare + withNotes(S.now.care, S.now.careNotes))); }
      if (S.now.careText.trim()) { parts.push(lines(S.now.careText.trim())); }
      if (S.now.help.length) { parts.push(esc(K.sumHelp + helpText())); }
      return parts.join('<br>');
    }
    var x = Q[qIndex(node)], a = answer(x.id);
    if (!a.st || a.st === 'none') { return ''; }
    if (node === 'day') { return esc(dayWho(a.picks[0] || '', a)); }
    if (x.kind === 'people') { return esc(withNotes(namesIn(node), a.notes)); }
    if (x.kind) { return esc(namesIn(node).join('、')); }
    var body = answerBody(a, false, x), label = (x.answers && x.answers[a.st]) || C.status[a.st];
    if (a.st === 'done' && x.sumDone) { label = fill(x.sumDone, { n: Math.max(1, pickedWho(x, a).length) }); }
    var head = x.answers || a.st === 'half' || !body;
    return (head ? '<span class="st ' + a.st + '">' + esc(label + (body ? '：' : '')) + '</span>' : '') + body;
  }

  /* 需要幫忙的事，寫了補充的接在後面：吃藥（早晚各一次） */
  function helpText() { return withNotes(S.now.help, S.now.helpNotes); }
  function withNotes(list, notes) {
    return list.map(function (k) { var t = String((notes || {})[k] || '').trim(); return t ? k + '（' + t + '）' : k; }).join('、');
  }

  /* 白天誰陪他：寫人，不寫地點（在家＝平常照顧他的人） */
  function dayWho(pick, a) {
    var w = (HS.dayWho || {})[pick], sub = a ? a.sub : '', txt = a ? String(a.text || '').trim() : '';
    if (w) { return w + (sub ? '（' + sub + '）' : ''); }
    if (pick === (Q[qIndex('day')].options[1] || [])[1]) {   /* 在家：選了家人以外的（居家服務員…）就寫那一個 */
      var fam = ((Q[qIndex('day')].sub || {})[pick] || { options: [] }).options[0];   /* 第二層的第一個＝家人 */
      if (sub && sub !== fam) { return sub + '（' + pick + '）'; }
      return (S.now.care.length ? S.now.care.join('、') : C.circle.you) + '（' + pick + '）';
    }
    return txt ? pick + '：' + txt : pick;
  }

  /* 櫃子裡的一段（#/ch/know…）：這一段每一題填了什麼，旁邊「編輯」或「填寫」 */
  function viewChapter(c) {
    var hit = progressParts().items.filter(function (t) { return t.id === c; })[0];
    if (!hit) { return viewInside(); }
    /* 2026-11-20 參賽者：每一段都可以傳圖片、傳文字、列印；「怎麼陪我」併進「怎麼陪他」（傳出去的就是怎麼陪我），誰陪過他放在最下面 */
    return '<div class="screen"><h1 tabindex="-1" class="noprint">' + esc(chapterName(c)) + '</h1><p class="sub noprint" data-say>' + esc(hit.badge) + '</p>' +
      '<ul class="rows noprint">' + hit.rows + '</ul>' + shareBox(c, true) + (c === 'day' ? logSection() : '') + '</div>';
  }

  /* 「他現在的狀況」在櫃子裡：階段、照顧的人、需要幫忙的事各一行，各自連到那一小頁（2026-11-18 參賽者：編輯不要跳錯頁） */
  function nowRow() {
    var K = C.circle, N = C.now;
    var parts = [
      [K.sumStage, (stageNow() ? stageNow() + (bornYear() ? '（' + fill(C.home.stageAgeBorn, { age: ageNow() }) + '）' : '') : '') + (S.now.stageText.trim() ? '　' + S.now.stageText.trim() : '')],
      [K.sumCare, (S.now.care.length ? withNotes(S.now.care, S.now.careNotes) : '') + (S.now.careText.trim() ? '　' + S.now.careText.trim() : '')],
      [K.sumHelp, S.now.help.length ? helpText() : '']];
    var h = '<li class="row"><p><b>' + esc(C.home.stepNow) + '</b></p><ul class="rows now-rows">';
    parts.forEach(function (t, k) {
      var label = t[0].replace(/[：:]$/, '');
      h += '<li><div class="who-head"><p class="sub">' + esc(label) + '</p>' +
        '<a tabindex="0" class="tool who-edit noprint" href="#/now/' + k + '">' + esc(t[1] ? K.edit : K.progressFill) + '<span class="sr">：' + esc(label) + '</span></a></div>' +
        '<p' + (t[1] ? '' : ' class="who-why"') + '>' + esc(t[1] || K.progressNotYet) + '</p></li>';
    });
    return h + '</ul></li>';
  }

  function progressParts() {
    var K = C.circle, n = 0, total = 0, body = '', items = [];
    CHAPTERS.forEach(function (c) {
      var rows = '', cn = 0, ct = 0;
      ORDER.forEach(function (node) {
        if (!known(node) || chapterOf(node) !== c || !(applicable(node) || answered(node))) { return; }
        var sum = summaryOf(node), st = isQ(node) ? answer(Q[qIndex(node)].id).st : '';
        ct++; if (sum) { cn++; }
        if (node === 'now') { rows += nowRow(); return; }   /* 他現在的狀況：三小頁各自一個「編輯」，不會都跳到出生年那一頁 */
        var mt = isQ(node) ? meetTag(Q[qIndex(node)]) : '';   /* 開會時可以和老師一起填 */
        rows += '<li class="row">' + (sum ? '<div class="who-head"><p><b>' + esc(titleOf(node)) + '</b>' + (mt ? ' ' + mt : '') + '</p><a tabindex="0" class="tool who-edit noprint" href="' + hrefOf(node) + '">' + esc(C.circle.edit) + '<span class="sr">：' + esc(titleOf(node)) + '</span></a></div>' : '<p><b>' + esc(titleOf(node)) + '</b></p>') + (sum ? '<p>' + sum + '</p>'
          : (mt ? '<p>' + mt + '</p>' : '') + '<p class="who-why">' + esc(st === 'none' ? C.status.none : K.progressNotYet) + '</p>' +
            '<a tabindex="0" class="tool" href="' + hrefOf(node) + '">' + esc(K.progressFill) + '<span class="sr">：' + esc(titleOf(node)) + '</span></a>') + '</li>';
      });
      if (!ct) { return; }
      n += cn; total += ct;
      var count = fill(C.home.groupCount, { n: cn, total: ct });
      body += '<h2>' + esc(chapterName(c)) + ' <span class="grp-count">' + esc(count) + '</span></h2><ul class="rows">' + rows + '</ul>';
      /* 一段一格：點了看這一段每一題填了什麼 */
      items.push({ id: c, icon: (C.tiles.chapterIcons || {})[c], label: chapterName(c), badge: count, dim: !cn, rows: rows,
        detail: '<h2 class="tile-h">' + esc(chapterName(c)) + ' <span class="grp-count">' + esc(count) + '</span></h2><ul class="rows">' + rows + '</ul>' });
    });
    return { sum: fill(K.progressSum, { n: n, total: total }), items: items, body: body };
  }

  /* --- 可以列印的兩頁 --- */

  /* 「怎麼陪我」有內容的每一列（列印、傳圖片、傳文字共用這一份） */
  function dayRows() {
    var out = [];
    byLayer('day').forEach(function (x) {
      var b = answerBody(answer(x.id), true, x);
      if (b) { out.push({ t: x.title, b: b }); }
    });
    if (S.now.help.length) { out.push({ t: C.out.helpRow, b: esc(helpText()) }); }
    return out;
  }

  /* 櫃子裡一段有內容的每一列（傳出去、列印用）。「怎麼陪他」用 dayRows（標家人說／老師說，加上需要幫忙的事） */
  function chapterRows(c) {
    if (c === 'day') { return dayRows(); }
    var out = [];
    ORDER.forEach(function (node) {
      if (!known(node) || chapterOf(node) !== c || !(applicable(node) || answered(node))) { return; }
      var sum = summaryOf(node);
      if (sum) { out.push({ t: titleOf(node), b: sum }); }
    });
    return out;
  }

  /* 要傳出去的一份：day＝「怎麼陪我」；其他段＝那一段；all＝四段全部（每段一個小標題） */
  function docFor(key) {
    var O = C.out;
    if (key === 'all') {
      return { file: O.allTitle, title: O.allTitle, intro: O.docIntro,
        sections: CHAPTERS.map(function (c) { return { h: c === 'day' ? O.dayTitle : chapterName(c), rows: chapterRows(c) }; }).filter(function (s) { return s.rows.length; }) };
    }
    if (key === 'day') { return { file: O.dayTitle, title: O.dayTitle, intro: O.docIntro, sections: [{ h: '', rows: dayRows() }] }; }
    return { file: chapterName(key), title: chapterName(key), intro: '', sections: [{ h: '', rows: chapterRows(key) }] };
  }
  function docEmpty(d) { return !d.sections.some(function (s) { return s.rows.length; }); }

  function docHtml(d, withTitle) {
    return (withTitle ? '<h2>' + esc(d.title) + '</h2>' + (d.intro ? '<p class="sub">' + esc(d.intro) + '</p>' : '') : '') +
      d.sections.map(function (s) {
        return (s.h ? '<h2>' + esc(s.h) + '</h2>' : '') + '<ul class="rows">' + s.rows.map(function (r) { return '<li class="row"><p><b>' + esc(r.t) + '</b></p><p>' + r.b + '</p></li>'; }).join('') + '</ul>';
      }).join('');
  }

  /* 傳圖片、傳文字、列印三顆（每一段和「全部的內容」共用）。printCopy＝畫面上是可編輯的樣子時，另放一份只在列印時出現 */
  function shareBox(key, printCopy) {
    var O = C.out, d = docFor(key);
    if (docEmpty(d)) { return '<p class="sub noprint" data-say>' + esc(O.shareEmpty) + '</p>'; }
    var b = function (act, label, cls) { return '<button type="button" class="' + cls + '" data-act="' + act + '" data-doc="' + key + '">' + esc(label) + '</button>'; };
    return (printCopy ? '<div class="print-only">' + docHtml(d, true) + '</div>' : '') +
      '<div class="share-box noprint"><h2>' + esc(O.shareTitle) + '</h2><p class="sub">' + esc(O.shareHint) + '</p>' +
      b('share', O.share, 'btn ghost') + b('shareText', O.shareText, 'btn ghost') + button('print', O.print, 'btn ghost') +
      '<p id="share-msg" class="share-msg" role="status" aria-live="polite"></p></div>';
  }

  function viewOutAll() {
    var O = C.out, d = docFor('all');
    return '<div class="screen"><h1 tabindex="-1">' + esc(O.allTitle) + '</h1><p class="sub" data-say>' + esc(O.allIntro) + '</p>' +
      (docEmpty(d) ? '' : docHtml(d, false)) + shareBox('all', false) + '</div>';
  }

  /* 誰陪過他（在「怎麼陪他」那一段的最下面） */
  /* 誰陪過他：紀錄多了以後，可以選「從幾月到幾月」「誰」收斂；預設只列最近 5 筆，按「看全部」才全部列出（2026-11-20 參賽者）。
     篩選只是這一次怎麼看，不存進裝置 */
  var LOG_SHOW = 5, logView = { from: 0, to: 0, who: '', all: false };
  function logYm(d) { var m = /^(\d+)\/(\d+)/.exec(d || ''); return m ? +m[1] * 100 + +m[2] : 0; }
  function ymText(v) { return fill(C.out.logYm, { y: Math.floor(v / 100), m: v % 100 }); }
  function logFilter() {
    var O = C.out, months = {}, who = {};
    S.log.forEach(function (g) { if (logYm(g.d)) { months[logYm(g.d)] = 1; } who[g.who] = 1; });
    var ms = Object.keys(months).map(Number).sort(function (x, y) { return x - y; });
    var opt = function (v, t, cur) { return '<option value="' + esc(String(v)) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + esc(t) + '</option>'; };
    var sel = function (id, label, first, list, cur) { return '<div><label class="field" for="' + id + '">' + esc(label) + '</label><select id="' + id + '">' + opt(0, first, cur) + list.map(function (x) { return opt(x[0], x[1], cur); }).join('') + '</select></div>'; };
    var ml = ms.map(function (v) { return [v, ymText(v)]; });
    return '<div class="log-filter noprint">' + sel('log-from', O.logFrom, O.logAnyTime, ml, logView.from) + sel('log-to', O.logTo, O.logAnyTime, ml, logView.to) +
      sel('log-whof', O.logWhoF, O.logAnyone, Object.keys(who).map(function (x) { return [x, x]; }), logView.who || 0) + '</div>';
  }
  function logList() {
    var O = C.out, v = logView;
    var hit = S.log.slice().reverse().filter(function (g) { var y = logYm(g.d);
      return (!v.from || y >= v.from) && (!v.to || y <= v.to) && (!v.who || g.who === v.who); });
    var filtered = v.from || v.to || v.who, show = v.all ? hit : hit.slice(0, LOG_SHOW), h = '';
    if (filtered) { h += '<p data-say>' + esc(hit.length ? fill(O.logHit, { n: hit.length }) : O.logNoHit) + '</p>'; }
    h += '<ul class="rows">';
    show.forEach(function (g) {
      h += '<li class="row"><p><b>' + esc(g.who) + '</b> <span class="sub">' + esc(g.d) + '</span></p><p>' + lines(g.did) +
        (g.found ? '<br>' + esc(O.logFound) + lines(g.found) : '') + '</p></li>';
    });
    h += '</ul>';
    if (hit.length > show.length) { h += button('logMore', fill(O.logMore, { n: hit.length }), 'btn ghost'); }
    return h;
  }

  function logSection() {
    var O = C.out, h = '', names = {};
    S.log.forEach(function (g) { names[g.who] = 1; });
    var nn = Object.keys(names).length;
    h += '<section class="block"><h2 id="log-title" tabindex="-1">' + esc(O.logTitle) + '</h2><p class="sub">' + esc(O.logIntro) + '</p>' +
      '<p>' + esc(nn ? fill(O.logCount, { people: nn, n: S.log.length }) : O.logNone) + '</p>' +
      (S.log.length > LOG_SHOW ? logFilter() : '') + '<div id="log-list">' + logList() + '</div>';
    h += '<details class="noprint"><summary>' + esc(O.logFormTitle) + '</summary>' +
      textField('log-who', O.logWho, '', 'short') + '<p class="err" id="err-who" hidden></p>' +
      textField('log-did', O.logDid, '', 'short') + '<p class="err" id="err-did" hidden></p>' +
      textField('log-new', O.logNew, '', 'short') + button('addLog', O.logAdd, 'btn ghost') + '</details></section>';
    return h;
  }

  function viewOutFuture() {
    var O = C.out, c = { done: 0, half: 0, none: 0 }, rows = '', items = [];
    byLayer('future').forEach(function (x) {
      var a = answer(x.id), st = a.st || 'none', b = answerBody(a, false, x), i = Q.indexOf(x);
      var more = (b ? '<p>' + b + '</p>' : '') +
        (a.next ? '<p><b>' + esc(O.futureNext) + '</b>' + lines(a.next) + '</p>' : '') +
        (st !== 'done' && x.ask ? '<p class="who-why">' + esc(O.futureAsk) + esc(x.ask) + '</p>' : '');
      c[st]++;
      rows += '<li class="row"><p><span class="st ' + st + '">' + esc(C.status[st]) + '</span><b>' + esc(x.q) + '</b></p>' + more + '</li>';
      items.push({ id: 'q' + x.id, icon: x.icon, label: x.title, badge: C.status[st], badgeCls: 'st-' + st, dim: st === 'none',
        detail: (a.st ? editHead(x.q, qHref(i)) : '<h2>' + esc(x.q) + '</h2>') + '<p><span class="st ' + st + '">' + esc(C.status[st]) + '</span></p>' + more +
          (!a.st ? '<p><a tabindex="0" class="tool" href="' + qHref(i) + '">' + esc(C.tiles.fill) + '<span class="sr">：' + esc(x.title) + '</span></a></p>' : '') });
    });
    var K = C.circle, pg = progressParts();
    return '<h1 tabindex="-1">' + esc(O.futureTitle) + '</h1>' +
      '<p class="big-line" data-say>' + esc(pg.sum) + '</p>' +
      '<h2>' + esc(O.futureStages) + '</h2><p class="sub" data-say>' + esc(K.progressIntro) + '</p>' +
      tileGrid('progress', O.futureStages, pg.items) +
      '<h2>' + esc(O.futureLater) + '</h2><p data-say>' + esc(fill(O.futureCount, c)) + '</p><p class="sub">' + esc(O.futureNote) + '</p>' +
      tileGrid('future', O.futureLater, items) +
      '<div class="print-only"><div class="stage-rows">' + pg.body + '</div><h2>' + esc(O.futureLater) + '</h2><ul class="rows">' + rows + '</ul></div>' +
      '<p class="sub note" data-say>' + esc(K.note) + '</p>' + button('print', O.print, 'btn primary');
  }

  /* --- 交給第二個人：傳圖片／傳文字（2026-11-19）---
     圖片在這台裝置上用 canvas 畫：1440 px 寬、大字，手機看和印成 A4 都清楚；存成 JPG（各種印表與上傳服務都收）。
     有系統分享選單（手機、部分桌機）就叫出來；沒有就下載。文字版給要複製、放大或用報讀軟體的人。 */
  function plainOf(html) {
    var d = document.createElement('div');
    d.innerHTML = String(html).replace(/<br\s*\/?>/gi, '\n');
    return d.textContent.replace(/[ \t]+\n/g, '\n').trim();
  }

  /* 一份內容的文字版：標題、說明，每段小標題，每一列「題目／內容」 */
  function docPlain(d) {
    var out = [d.title].concat(d.intro ? [d.intro] : []);
    d.sections.forEach(function (s) {
      if (s.h) { out.push('\n【' + s.h + '】'); }
      s.rows.forEach(function (r) { out.push('\n' + r.t + '\n' + plainOf(r.b)); });
    });
    return out.join('\n');
  }

  function shareMsg(t) { var m = $('share-msg'); if (m) { m.textContent = t; } }

  /* 一行一行斷（中文逐字；標點不放行首） */
  function wrapText(ctx, text, maxW) {
    var out = [];
    String(text).split('\n').forEach(function (par) {
      var line = '';
      Array.from(par).forEach(function (ch) {
        if (line && ctx.measureText(line + ch).width > maxW && '，。、；：）」』！？'.indexOf(ch) < 0) { out.push(line); line = ch; } else { line += ch; }
      });
      out.push(line);
    });
    return out;
  }

  function docCanvas(d) {
    var W = 1440, PAD = 96, maxW = W - PAD * 2, fam = getComputedStyle(document.body).fontFamily;
    var col = { bg: '#fffaf0', ink: '#3b2f2a', sub: '#6b5a50', line: '#e0cfb2', main: '#a8442c', band: '#f6e3c4' };
    var cv = document.createElement('canvas'), ctx = cv.getContext('2d');
    var blocks = [{ f: '700 76px', c: col.ink, t: d.title, gap: 24, rule: !d.intro }];
    if (d.intro) { blocks.push({ f: '400 42px', c: col.sub, t: d.intro, gap: 40, rule: true }); }
    d.sections.forEach(function (s) {
      if (s.h) { blocks.push({ f: '700 58px', c: col.ink, t: s.h, gap: 28, band: true }); }   /* 段的小標題：淺色底條 */
      s.rows.forEach(function (r) {
        blocks.push({ f: '700 48px', c: col.main, t: r.t, gap: 12 });
        blocks.push({ f: '400 46px', c: col.ink, t: plainOf(r.b), gap: 36, rule: true });
      });
    });
    function layout(draw) {
      var y = PAD;
      blocks.forEach(function (b) {
        var size = parseInt(b.f.split(' ')[1], 10), lh = Math.round(size * 1.5);
        ctx.font = b.f + ' ' + fam;
        var ls = wrapText(ctx, b.t, maxW);
        if (b.band) { y += 24; if (draw) { ctx.fillStyle = col.band; ctx.fillRect(PAD - 24, y - 12, maxW + 48, ls.length * lh + 24); } }
        ls.forEach(function (ln) {
          if (draw) { ctx.fillStyle = b.c; ctx.fillText(ln, PAD, y + size); }
          y += lh;
        });
        y += b.gap;
        if (b.rule) { if (draw) { ctx.fillStyle = col.line; ctx.fillRect(PAD, y - b.gap / 2, maxW, 3); } y += 8; }
      });
      return y + PAD - 40;
    }
    cv.width = W; cv.height = layout(false);   /* 先量高度，改尺寸會清掉設定，再畫一次 */
    ctx.fillStyle = col.bg; ctx.fillRect(0, 0, W, cv.height);
    ctx.textBaseline = 'alphabetic';
    layout(true);
    return cv;
  }

  function shareImage(key) {
    var O = C.out, d = docFor(key), name = d.file + '.jpg';
    docCanvas(d).toBlob(function (blob) {
      if (!blob) { shareMsg(O.shareFail); return; }
      var file = null;
      try { file = new File([blob], name, { type: 'image/jpeg' }); } catch (e) { file = null; }
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: d.title }).catch(function (e) { if (e && e.name !== 'AbortError') { shareMsg(O.shareFail); } });
        return;
      }
      var a = document.createElement('a'), url = URL.createObjectURL(blob);   /* 沒有分享選單：直接存檔 */
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      shareMsg(fill(O.shareSaved, { file: d.file }));
    }, 'image/jpeg', 0.92);
  }

  function shareText(key) {
    var d = docFor(key), t = docPlain(d);
    if (navigator.share) {
      navigator.share({ title: d.title, text: t }).catch(function (e) { if (e && e.name !== 'AbortError') { copyText(t); } });
      return;
    }
    copyText(t);
  }

  function copyText(t) {
    var O = C.out;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { shareMsg(O.shareCopied); }, function () { shareMsg(O.shareFail); });
    } else { shareMsg(O.shareFail); }
  }

  /* 兩頁各自獨立，從首頁的連結進來（不再有上方的切換） */
  function viewOut(tab) {
    if (tab === 'all') { return viewOutAll(); }
    if (tab === 'day') { return viewChapter('day'); }   /* 舊的「怎麼陪我」網址：併進「怎麼陪他」那一段（2026-11-20） */
    return '<div class="screen">' + viewOutFuture() + '</div>';
  }

  /* --- 資源路線圖 --- */

  /* 一格一件事（圖示＋字），點了才在下面顯示「可以問誰」。本地窗口的輸入框再收一層，要填才打開 */
  var resOpen = '';   /* 現在打開的是哪一格；只記在這一次開啟裡 */

  function resFirst() {   /* 只調整順序（規則寫在 content.js 的 resources.promote），不是評估 */
    return (C.resources.promote || []).filter(function (p) { return meets(p.askIf); }).map(function (p) { return p.id; });
  }

  var resCounty = '';   /* 看機構名稱時選的縣市；只記在這一次開啟裡，不預設（免得看起來像在猜使用者住哪裡） */
  var resKind = '';     /* 選了縣市之後再選的那一種（小作所、社區日照…） */
  var INST = window.INSTITUTIONS || null;   /* 政府公開名冊（data-institutions.js）；讀不到就不顯示名稱那一塊 */
  var WIN = window.WINDOWS || null;          /* 各縣市的窗口（data-windows.js）；讀不到就不顯示 */

  /* 電話號碼 → 可以直接撥的連結（一格裡有好幾支時取第一支） */
  function telHref(phone) {
    var m = String(phone).replace(/[(（](0\d{1,3})[)）]\s*/g, '$1-').match(/\d[\d\-]{6,}/) || String(phone).match(/^1\d{3}$/);   /* (03)5943248 → 03-5943248，區碼不能掉；1966 這種四碼專線也可以撥 */
    return m ? 'tel:' + m[0].replace(/\D/g, '') : '';
  }

  /* 選了縣市之後的名單：照型態分組，只列名稱、鄉鎮、電話（不放人數） */
  function instList(all) {
    var R = C.resources;
    if (!resCounty) { return ''; }
    var countOf = function (k) { return k.inst ? INST.rows.filter(function (x) { return x[1] === resCounty && x[4] === k.inst; }).length : -1; };
    var h = '<p class="field kind-label">' + esc(R.instKindPick) + '</p><div class="kind-pick" role="group" aria-label="' + esc(R.instKindPick) + '">';
    all.forEach(function (k) {
      var n = countOf(k);
      h += '<button type="button" class="tool kind-btn" data-act="instKind" data-k="' + k.id + '" aria-pressed="' + (resKind === k.id ? 'true' : 'false') + '">' +
        '<span>' + esc(k.name) + '</span>' + (n >= 0 ? '<span class="kind-n">' + esc(fill(R.instKindN, { n: n })) + '</span>' : '') + '</button>';
    });
    h += '</div>';
    var pick = all.filter(function (k) { return k.id === resKind; });
    if (!pick.length) { return h + '<p class="sub">' + esc(R.instKindHint) + '</p>'; }
    var kinds = pick.filter(function (k) { return k.inst; }), others = pick.filter(function (k) { return !k.inst; });
    kinds.forEach(function (k) {
      var rows = INST.rows.filter(function (x) { return x[1] === resCounty && x[4] === k.inst; });
      if (!rows.length) {   /* 有登記「誰公告名冊」的型態（家托）：講那個單位；沒有就講問社會局 */
        var tb = (R.rosters || {})[k.id], t0 = tb && tb[resCounty];
        h += '<p class="sub">' + esc(tb ? (t0 ? fill(R.rosterLine, { kind: k.name, unit: t0[0], date: t0[1] ? fill(R.rosterDate, { date: t0[1] }) : '' }) : fill(R.rosterNone, { kind: k.name, county: resCounty })) : fill(R.instNone, { county: resCounty, kind: k.name })) + '</p>';
        if (k.note) { h += '<p class="sub inst-ltc">' + esc(k.note) + '</p>'; }
        return;
      }
      h += '<h3>' + esc(fill(R.instCount, { county: resCounty, kind: k.name, n: rows.length })) + '</h3><ul class="rows inst-rows">';
      rows.forEach(function (x) {
        var tel = telHref(x[3]);
        h += '<li class="row"><p><b>' + esc(x[0]) + '</b></p>' + (x[2] ? '<p class="sub">' + esc(x[2]) + '</p>' : '') +
          (tel ? '<a tabindex="0" class="tool" href="' + tel + '"><span aria-hidden="true">📞</span><span>' + esc(R.instCall) + '<span class="sr">：' + esc(x[0]) + '</span> ' + esc(x[3]) + '</span></a>' : '<p>' + esc(x[3]) + '</p>') + '</li>';
      });
      h += '</ul>';
      /* 這一類名單來自哪一份名冊；舊的（109 年）加一句提醒 */
      rows.map(function (x) { return x[5] || 0; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).forEach(function (k) {
        var src = (INST.sources || [])[k];
        if (!src) { return; }
        h += '<p class="sub inst-from">' + esc(fill(R.instFrom, { from: src.from, date: src.date })) + '</p>' +
          (src.old ? '<p class="sub inst-old">' + esc(fill(R.instOld, { date: src.date })) + '</p>' : '') +
          (src.ltc && R.instLtc ? '<p class="sub inst-ltc">' + esc(R.instLtc) + '</p>' : '');   /* 長照的家托：要走長照評估，不是身障需求評估 */
      });
    });
    /* 名冊裡沒有的型態：這個縣市是誰在公告名冊（只寫單位，不放名單） */
    (others || []).forEach(function (k) {
      var table = (R.rosters || {})[k.id];
      if (!table) { return; }
      var t = table[resCounty];
      h += '<p class="roster">' + esc(t ? fill(R.rosterLine, { kind: k.name, unit: t[0], date: t[1] ? fill(R.rosterDate, { date: t[1] }) : '' }) : fill(R.rosterNone, { kind: k.name, county: resCounty })) + '</p>';
    });
    return h;
  }

  /* 這一格的型態（帶上代號） */
  function resKinds(r) {
    var K = C.resources.kinds || {};
    return ((r && r.kinds) || []).filter(function (k) { return K[k]; }).map(function (k) { return { id: k, name: K[k].name, what: K[k].what, inst: K[k].inst, note: K[k].note }; });
  }
  function hasInst(r) { return !!INST && resKinds(r).some(function (k) { return k.inst; }); }

  /* 這件事有哪幾種型態（白話），和「看各縣市的機構名稱和電話」 */
  function kindsBlock(r) {
    var R = C.resources, kinds = resKinds(r);
    if (!kinds.length) { return ''; }
    var h = '<p class="kinds-title"><b>' + esc(R.kindsTitle) + '</b></p><ul class="kinds">';
    kinds.forEach(function (k) { h += '<li><b>' + esc(k.name) + '</b><span>' + esc(k.what) + '</span></li>'; });
    h += '</ul>';
    if (r.bed && R.bedUrl) {   /* 住的地方：官方床位查詢（另開分頁，當下的資料） */
      h += '<p class="bed-link"><a href="' + esc(R.bedUrl) + '" target="_blank" rel="noopener">' + esc(R.bedLink) + '<span class="sr">' + esc(R.newWin) + '</span></a></p><p class="sub">' + esc(R.bedNote) + '</p>';
    }
    var listed = kinds.filter(function (k) { return k.inst; }), missing = kinds.filter(function (k) { return !k.inst; });
    if (!INST || !listed.length) { return h; }
    h += '<details class="local inst"' + (resCounty ? ' open' : '') + '><summary>' + esc(R.instToggle) + '</summary>' +
      '<label class="field" for="inst-county">' + esc(R.instCounty) + '</label><select id="inst-county"><option value="">' + esc(R.instPick) + '</option>';
    INST.counties.forEach(function (ct) { h += '<option' + (ct === resCounty ? ' selected' : '') + '>' + esc(ct) + '</option>'; });
    h += '</select><div id="inst-list" aria-live="polite">' + instList(kinds) + '</div>' +
      '<p class="sub">' + esc(fill(R.instNote, { date: INST.fetched })) + '</p>' +
      (missing.length ? '<p class="sub">' + esc(fill(R.instMissing, { names: missing.map(function (k) { return k.name; }).join('、') })) + '</p>' : '') + '</details>';
    return h;
  }

  /* 這一格在選的縣市可以問誰（官方網頁上的單位和電話） */
  function hasWin(r) { return !!WIN && !!r && WIN.codes.indexOf(r.id) >= 0; }
  function winList(r) {
    var R = C.resources;
    if (!resCounty) { return ''; }
    var rows = WIN.rows.filter(function (x) { return x[0] === resCounty && x[1].indexOf(r.id) >= 0; });
    var h = '<h3>' + esc(fill(R.winCount, { county: resCounty })) + '</h3><ul class="rows win-rows">';
    rows.forEach(function (x) {
      var tel = telHref(x[3]);
      h += '<li class="row"><p><b>' + esc(x[2]) + '</b></p>' +
        (tel ? '<a tabindex="0" class="tool" href="' + tel + '"><span aria-hidden="true">📞</span><span>' + esc(R.instCall) + '<span class="sr">：' + esc(x[2]) + '</span> ' + esc(x[3]) + '</span></a>' : '<p>' + esc(x[3]) + '</p>') +
        '<p class="sub"><a href="' + esc(x[4]) + '" target="_blank" rel="noopener">' + esc(R.winSource) + '<span class="sr">：' + esc(x[2]) + '</span></a>' + (x[5] ? '（' + esc(x[5]) + '）' : '') + '</p>' +
        (x[6] ? '<p class="sub inst-old">' + esc(R.winOld) + '</p>' : '') + '</li>';
    });
    return h + '</ul>';
  }
  function winBlock(r) {
    var R = C.resources;
    if (!hasWin(r)) { return ''; }
    var h = '<details class="local win"' + (resCounty ? ' open' : '') + '><summary>' + esc(R.winToggle) + '</summary>' +
      '<label class="field" for="win-county">' + esc(R.instCounty) + '</label><select id="win-county"><option value="">' + esc(R.instPick) + '</option>';
    WIN.counties.forEach(function (ct) { h += '<option' + (ct === resCounty ? ' selected' : '') + '>' + esc(ct) + '</option>'; });
    return h + '</select><div id="win-list" aria-live="polite">' + winList(r) + '</div>' +
      '<p class="sub">' + esc(fill(R.winNote, { date: WIN.checked })) + '</p></details>';
  }

  function resDetail(id) {
    var R = C.resources, r = R.items.filter(function (x) { return x.id === id; })[0];
    if (!r) { return ''; }   /* 還沒點：下面不放字（2026-11-18 參賽者） */
    var val = S.res[r.id] || '';
    return '<h2>' + esc(r.when) + '</h2><p><b>' + esc(R.askPrefix) + '</b>' + esc(r.ask) + '</p>' +
      (r.note ? '<p class="sub">' + esc(R.noteLabel) + esc(r.note) + '</p>' : '') + (r.id === 'r4' ? pathCard(false) : '') + winBlock(r) + kindsBlock(r) +
      '<details class="local"' + (val ? ' open' : '') + '><summary>' + esc(val ? R.localEdit : R.localToggle) + '</summary>' +
      '<label class="field" for="res-' + r.id + '">' + esc(R.localLabel) + '<span class="sr">' + esc(r.when) + '</span></label>' +
      '<textarea id="res-' + r.id + '" class="short" data-res="' + r.id + '">' + esc(val) + '</textarea></details>' +
      ((R.footFor || []).indexOf(r.id) >= 0 ? '<p class="sub res-foot">' + esc(R.foot) + '</p>' : '');
  }

  /* 這一格在哪一頁：以後的安排（住、錢、法律、討論以後）另一頁，其他在「需要幫忙時，可以找誰」 */
  function isLaterRes(id) { return (C.resources.laterIds || []).indexOf(id) >= 0; }
  function resHref(id) { return (isLaterRes(id) ? '#/later/' : '#/res/') + id; }

  function viewRes(later) {
    var R = C.resources, first = resFirst();
    if (route.id && R.items.some(function (x) { return x.id === route.id; })) { resOpen = route.id; later = isLaterRes(route.id); }   /* 舊連結 #/res/r8 也打得開 */
    var mine = R.items.filter(function (r) { return isLaterRes(r.id) === !!later; });
    if (resOpen && !mine.some(function (r) { return r.id === resOpen; })) { resOpen = ''; }
    var list = mine.filter(function (r) { return first.indexOf(r.id) >= 0; }).concat(mine.filter(function (r) { return first.indexOf(r.id) < 0; }));
    var title = later ? R.laterTitle : R.title;
    /* 2026-11-18 參賽者：大標題「家裡的電話／月曆」和「家裡的櫃子」一樣；原本的標題改成和說明同樣的小字 */
    var h = '<div class="screen"><h1 tabindex="-1">' + esc(later ? R.laterTag : R.tag) + '</h1><p class="sub res-what print-only">' + esc(title) + '</p><p class="sub noprint" data-say>' + esc(later ? R.laterIntro : R.intro) + '</p>' +
      '<div class="res-grid noprint" role="group" aria-label="' + esc(title) + '">';
    list.forEach(function (r) {
      var isFirst = first.indexOf(r.id) >= 0;
      h += '<button type="button" class="res-tile' + (isFirst ? ' first' : '') + (resOpen === r.id ? ' is-on' : '') + '" data-act="res" data-id="' + r.id + '" aria-expanded="' + (resOpen === r.id ? 'true' : 'false') + '" aria-controls="res-detail">' +
        (isFirst ? '<span class="res-first">' + esc(R.firstTitle) + '</span>' : '') +
        '<span class="ico" aria-hidden="true">' + esc(r.icon || '') + '</span><span>' + esc(r.when) + '</span>' +
        (hasInst(r) ? '<span class="res-has">' + esc(R.hasList) + '</span>' : '') + '</button>';
    });
    h += '</div><div id="res-detail" class="res-detail noprint" aria-live="polite">' + resDetail(resOpen) + '</div>';
    /* 列印用：全部列出來（畫面上不顯示） */
    h += '<div class="print-only"><p class="sub">' + esc(R.printNote) + '</p><ul class="rows">';
    list.forEach(function (r) {
      h += '<li class="row"><p><b>' + esc(r.when) + '</b></p><p>' + esc(R.askPrefix) + esc(r.ask) + '</p>' +
        (S.res[r.id] ? '<p>' + esc(R.localLabel) + lines(S.res[r.id]) + '</p>' : '') + '</li>';
    });
    /* 2026-11-20 參賽者：電話、月曆不需要「列印這一頁」按鈕（瀏覽器自己列印時仍用下面的紙本樣式） */
    return h + '</ul><p class="sub">' + esc(R.foot) + '</p></div></div>';   /* 那一句只在紙本最下面；畫面上在畢業之後那幾格裡 */
  }

  function openRes(id) {
    resOpen = resOpen === id ? '' : id;
    var box = $('res-detail');
    box.innerHTML = resDetail(resOpen);
    Array.prototype.forEach.call(app.querySelectorAll('.res-tile'), function (b) {
      var on = b.getAttribute('data-id') === resOpen;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-expanded', on ? 'true' : 'false');
    });
    if (resOpen && box.scrollIntoView) { box.scrollIntoView({ block: 'nearest' }); }
  }

  /* ============ 5. 換頁 ============ */

  var route = { name: 'home' };

  /* 網址 # 後面 → 現在在哪一頁。看不懂的一律回首頁 */
  function parseRoute() {
    var p = (window.location.hash || '').replace(/^#\/?/, '').split('/');
    var n = parseInt(p[1], 10);
    if (p[0] === 'q' && n >= 0 && n < Q.length) { return { name: 'q', i: n, answer: p[2] === 'a' }; }
    if (p[0] === 'now') { return { name: 'now', part: n >= 0 && n < NOW_PARTS.length ? n : 0 }; }
    if (p[0] === 'out') { return { name: 'out', tab: p[1] === 'future' ? 'future' : p[1] === 'all' ? 'all' : 'day' }; }
    if (p[0] === 'o' && (p[1] === 'origin' || p[1] === 'others' || p[1] === 'worry') && F[p[1]]) { return { name: 'o', node: p[1] }; }
    if (p[0] === 'res' && p[1]) { return { name: 'res', id: p[1] }; }   /* #/res/r4＝直接打開那一格 */
    if (p[0] === 'ch' && CHAPTERS.indexOf(p[1]) >= 0) { return { name: 'ch', id: p[1] }; }   /* 櫃子裡的一段 */
    if (p[0] === 'later') { return { name: 'later', id: p[1] || '' }; }   /* 以後的安排，可以問誰 */
    if (p[0] === 'steps' || p[0] === 'res' || p[0] === 'stop' || p[0] === 'who' || p[0] === 'progress' || p[0] === 'inside') { return { name: p[0] }; }
    return { name: 'home' };
  }

  function viewOf(r) {
    return r.name === 'q' ? viewStatus(r.i)   /* #/q/N/a 是舊的第二個畫面，現在同一頁 */
      : r.name === 'now' ? viewNow(r.part)
      : r.name === 'o' ? (r.node === 'origin' ? viewOrigin() : r.node === 'others' ? viewOthers() : viewWorry())
      : r.name === 'steps' ? viewSteps()
      : r.name === 'stop' ? viewStop()
      : r.name === 'who' ? viewWho()
      : r.name === 'inside' ? viewInside()
      : r.name === 'ch' ? viewChapter(r.id)
      : r.name === 'progress' ? viewOut('future')   /* 「準備到哪裡了」併進「還沒有答案的事」；舊連結照樣打得開 */
      : r.name === 'out' ? viewOut(r.tab)
      : r.name === 'res' ? viewRes(false)
      : r.name === 'later' ? viewRes(true)
      : viewHome();
  }

  /* 走過的畫面（記在記憶體裡）。題目不再排成一條線，所以「上一步」是回到剛才那個畫面 */
  var navStack = [window.location.hash || '#/home'];

  function trackNav() {
    var h = window.location.hash || '#/home', n = navStack.length;
    if (n > 1 && navStack[n - 2] === h) { navStack.pop(); }
    else if (navStack[n - 1] !== h) { navStack.push(h); }
    if (navStack.length > 60) { navStack.shift(); }
  }

  /* 題目頁的「上一步」＝流程裡的上一題（2026-11-19 參賽者）：他現在的狀況三小頁照順序；
     第一題回首頁；從櫃子一段進來的，在那一段裡往回，第一題回櫃子；這一題不在流程裡才用瀏覽紀錄 */
  function prevQuestion(fallback) {
    var here = hereHref(), m = /^#\/ch\/(\w+)$/.exec(returnTo || '');
    if (m) { var pages = chapterPages(m[1]), at = pages.indexOf(here); return at > 0 ? pages[at - 1] : returnTo; }
    var all = [];
    ORDER.filter(applicable).forEach(function (n) {
      if (n === 'now') { NOW_PARTS.forEach(function (_, k) { all.push('#/now/' + k); }); } else { all.push(hrefOf(n)); }
    });
    var k = all.indexOf(here);
    return k > 0 ? all[k - 1] : k === 0 ? '#/home' : fallback;
  }

  /* 頁首固定在最上面：上一步（或首頁）、設定。題目頁下面多一條進度：一段一格，再一行「段名・第幾題」 */
  function updateHeader() {
    var flow = inFlow(route), back = $('back'), prog = $('progress');
    var prev = navStack.length > 1 ? navStack[navStack.length - 2] : '#/home';
    var here = nodeOf(route), ch = flow ? chapterOf(here) : '';
    /* 首頁和櫃子：左上角是一排兩顆的切換（家｜櫃子）；第一次打開還沒有東西可看，不顯示 */
    /* 家、櫃子、電話、月曆四頁都留著這一排（2026-11-18 參賽者：點電話、月曆跟點櫃子一樣，這一排不消失、不出現上一頁） */
    /* 2026-11-20 參賽者：這一排每一頁都在（題目頁也是），和深色、大字、朗讀排同一行。櫃子裡的每一段、全部的內容也算「櫃子」 */
    var inCabinet = route.name === 'inside' || route.name === 'ch' || (route.name === 'out' && route.tab !== 'future');
    var tabs = $('tabs');
    tabs.hidden = false;
    {
      tabs.setAttribute('aria-label', C.inside.navLabel);
      tabs.innerHTML = [['#/home', '🏠', C.inside.tabHome, route.name === 'home'], ['#/inside', '🗄️', C.inside.tab, inCabinet],
        ['#/res', '☎️', C.inside.tabRes, route.name === 'res' && !isLaterRes(route.id), C.resources.title], ['#/later', '📅', C.inside.tabLater, route.name === 'later' || (route.name === 'res' && isLaterRes(route.id)), C.resources.laterTitle]].map(function (t) {
        return '<a tabindex="0" class="tool" href="' + t[0] + '"' + (t[3] ? ' aria-current="page"' : '') + '><span aria-hidden="true">' + t[1] + '</span><span>' + esc(t[2]) + '</span>' +
          (t[4] ? '<span class="sr">：' + esc(t[4]) + '</span>' : '') + '</a>';
      }).join('');
    }
    back.hidden = !flow;   /* 「上一步」只在題目頁，放在第二行（和進度一起）；其他頁用上面那一排換頁 */
    /* 左上角：題目頁＝上一步；其他頁＝回到剛才那一頁（例如從櫃子點進來就回櫃子）。直接打開、沒有上一頁時才是「首頁」 */
    var hasPrev = navStack.length > 1 && prev !== (window.location.hash || '#/home');
    back.setAttribute('href', flow ? prevQuestion(prev) : hasPrev ? prev : '#/home');
    $('back-label').textContent = flow ? C.app.back : (hasPrev && prev !== '#/home' ? C.app.backPage : C.app.home);
    prog.hidden = !ch;
    $('subbar').hidden = back.hidden && prog.hidden;
    if (ch) {
      var segs = '';
      CHAPTERS.forEach(function (c) {
        if (c === ch) {   /* 現在這一段：一題一小格，從左往右填——走過幾題就填幾格，下一格（＝「第幾題」那個數字）多一圈（2026-11-18 參賽者） */
          var s0 = chapterStep(c, here), cells = '';
          s0.list.forEach(function (n, k) { cells += '<b class="pc' + (k !== s0.n - 1 && visited(n) ? ' done' : '') + (k === s0.n - 1 ? ' now' : '') + '"></b>'; });
          if (!s0.list.length) { cells = '<b class="pc now"></b>'; }
          segs += '<i class="here">' + cells + '</i>';
          return;
        }
        var t = chapterStep(c, '');
        segs += '<i><b style="width:' + Math.round(t.done / t.total * 100) + '%"></b></i>';
      });
      var st = chapterStep(ch, here);
      prog.innerHTML = '<span class="segs" aria-hidden="true">' + segs + '</span>' +
        '<p class="prog-text">' + esc(fill(C.app.chapterProgress, { chapter: chapterName(ch), n: st.n, total: st.total })) + '</p>';
    }
  }

  /* 畫出現在這一頁。moveFocus：把焦點移到新頁的標題（換頁時要，第一次開啟不要） */
  function render(moveFocus, focusSelector) {
    stopSpeaking();
    if (/^#\/?circle/.test(window.location.hash)) { window.location.replace('#/home'); return; }   /* 「這個家」已經併進首頁；舊連結轉過去 */
    var was = route ? route.name + (route.i === undefined ? route.part : route.i) : '';
    route = parseRoute();
    var prevHash = lastHash; lastHash = window.location.hash || '#/home';
    if (!inFlow(route)) { returnTo = ''; }
    else if (/^#\/(ch\/|inside|out\/)/.test(prevHash)) { returnTo = prevHash; }   /* 從櫃子點進題目 */
    if (route.name + (route.i === undefined ? route.part : route.i) !== was) { noteActive = ''; }   /* 換了題目：框回到最後勾的那一個 */
    try { app.innerHTML = viewOf(route); } catch (e) { contentBroken(e); return; }
    updateHeader();
    var h1 = app.querySelector('h1');
    document.title = (route.name === 'home' ? '' : (h1 ? h1.textContent : '') + '｜') + C.app.name;
    app.setAttribute('data-route', window.location.hash || '#/home');   /* 給測試腳本看：這一頁畫完了 */
    if (moveFocus) {
      var target = app.querySelector(focusSelector || 'h1');
      if (!focusSelector) { window.scrollTo(0, 0); }
      if (target) { target.focus({ preventScroll: !focusSelector }); }
    }
  }

  var pendingMsg = '';   /* 換頁之後要顯示的訊息 */

  function go(hash, msg) {
    pendingMsg = msg || '';
    if (window.location.hash === hash) { onRouteChange(); } else { window.location.hash = hash; }
  }

  function onRouteChange() {
    trackNav();
    render(true);
    say(pendingMsg);
    pendingMsg = '';
  }

  /* 給螢幕報讀器和畫面上方的訊息列（WCAG 4.1.3） */
  function say(msg) { statusBox.textContent = msg; }

  /* ============ 6. 使用者的操作 ============ */

  /* --- 右上角兩顆：大字、唸給我聽 --- */

  function applyBig() {
    document.documentElement.classList.toggle('big', !!S.big);
    $('big').setAttribute('aria-pressed', S.big ? 'true' : 'false');
    $('big-state').textContent = S.big ? C.app.bigTextOn : C.app.bigTextOff;
  }

  /* --- 深色：沒按過＝跟著系統（CSS 的 prefers-color-scheme）；按了存 'udl-theme'，index.html 開頭那一小段會在第一幀套上 --- */
  var THEME_KEY = 'udl-theme';
  function isDark() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t) { return t === 'dark'; }
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  /* 切換鈕在頂端列、大字的左邊（index.html #theme） */
  function applyTheme() {
    var b = $('theme'), on = isDark();
    if (!b) { return; }
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    $('theme-state').textContent = on ? C.app.darkOn : C.app.darkOff;
  }
  function toggleTheme() {
    var t = isDark() ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    try { window.localStorage.setItem(THEME_KEY, t); } catch (e) { /* 存不了：這次開著有效，下次回到跟著系統 */ }
    applyTheme();   /* 不另外跳「已經換成…」（2026-11-18 參賽者）：按鈕上的開／關和 aria-pressed 就是回饋 */
  }

  /* --- 朗讀：唸這一頁的標題和標了 data-say 的字 --- */

  function canSpeak() { return !!(window.speechSynthesis && window.SpeechSynthesisUtterance); }
  var speaking = false;

  function setSpeaking(on) {
    speaking = on;
    $('speak-label').textContent = on ? C.app.stopSpeak : C.app.speakPage;
  }

  function stopSpeaking() {
    if (!speaking) { return; }
    try { window.speechSynthesis.cancel(); } catch (e) { /* 沒有朗讀功能就算了 */ }
    setSpeaking(false);
  }

  /* withNames=false：跳過寫著人名的句子（data-say="names"）。人名可能是使用者自己打的，
     雲端語音會把要唸的字送到瀏覽器廠商那裡，所以用雲端語音時不唸這幾句，「輸入的內容不會上傳」才是真的 */
  function pageText(withNames) {
    var parts = [];
    Array.prototype.forEach.call(app.querySelectorAll('h1, [data-say]'), function (el) {
      if (!withNames && el.getAttribute('data-say') === 'names') { return; }
      parts.push(el.textContent.trim());
    });
    return parts.join('。');
  }

  /* 挑這台裝置上品質最好的中文語音：臺灣國語優先；同樣是臺灣國語時，神經語音（名字裡有 Natural／Online）＞ Google ＞ 系統內建。
     每次要唸的時候才重新抓清單（清單是慢慢載入的，開頁時存起來的會過期）。挑不到就不指定，交給系統照 zh-TW 唸 */
  function bestVoice() {
    var list = [];
    try { list = window.speechSynthesis.getVoices() || []; } catch (e) { return null; }
    var best = null, bestScore = 0;
    Array.prototype.forEach.call(list, function (v) {
      var lang = String((v && v.lang) || '').replace('_', '-').toLowerCase(), name = String((v && v.name) || '');
      if (lang.indexOf('zh') !== 0 && lang.indexOf('cmn') !== 0) { return; }
      var score = (lang === 'zh-tw' || lang.indexOf('hant-tw') >= 0) ? 100 : (lang.indexOf('hk') >= 0 || lang.indexOf('yue') >= 0) ? 1 : 40;
      score += /natural|neural/i.test(name) ? 50 : /online/i.test(name) ? 45 : /google/i.test(name) ? 30 : /premium|enhanced/i.test(name) ? 25 : 0;
      if (score > bestScore) { best = v; bestScore = score; }
    });
    return best;
  }

  /* 按一下開始唸，再按一下停（WCAG 1.4.2：聲音要能停） */
  function toggleSpeak() {
    if (speaking) { stopSpeaking(); return; }
    try {
      var v = bestVoice();
      var u = new window.SpeechSynthesisUtterance(pageText(!(v && v.localService === false)));
      u.lang = 'zh-TW';
      u.rate = 0.9;
      if (v) { try { u.voice = v; u.lang = v.lang || 'zh-TW'; } catch (e2) { /* 指定不了就用系統預設的 */ } }
      u.onend = u.onerror = function () { setSpeaking(false); };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
      setSpeaking(true);
    } catch (e) { setSpeaking(false); }
  }

  /* --- 選狀態：「還沒想」直接到下一題；其他兩個到回答的畫面 --- */

  /* 選了狀態：不換頁，同一頁重畫（下面展開或收起），焦點留在剛按的那一顆 */
  function stayHere(sel, msg) {
    save();
    render(true, sel);
    updateHeader();
    if (msg) { say(msg); }
  }

  function chooseStatus(s) {
    var x = Q[route.i];
    answer(x.id).st = s;
    stayHere('[data-act=status][data-s="' + s + '"]');
  }

  /* 按「下一步」：拿這一題的狀態和點過的圖卡去對規則 */
  function leaveAnswer() {
    var x = Q[route.i], a = answer(x.id);
    goNext(x.next, [a.st].concat(a.picks));
  }

  /* --- 第四版的題型 --- */

  function chooseOption(k) {
    var x = Q[route.i], a = answer(x.id), text = x.options[k][1];
    if (a.picks[0] !== text) { a.sub = ''; if (x.sub) { a.text = ''; } }   /* 換了一個：第二層重選 */
    a.picks = [text];
    a.st = 'done';
    if (x.id === 'hisAge') { stampNow(); }
    stayHere('[data-act=choice][data-k="' + k + '"]');   /* 不自己跳頁（2026-11-18 參賽者），按「下一步」才走 */
  }

  function leavePeople() {
    var x = Q[route.i], a = answer(x.id);
    a.st = 'done';
    goNext(x.next, a.picks);
  }

  /* --- 題目下面中間那一顆：這一題有內容＝「下一步」，沒有＝「先不答」 --- */

  function forward() {
    var has = hasContent(), node = nodeOf(route), x, a, o;
    if (route.name === 'now') {
      if (route.part < NOW_PARTS.length - 1) { go('#/now/' + (route.part + 1)); return; }
      if (nowFilled()) { goNext(F.nowNext, [stageNow()].concat(S.now.care, S.now.help)); } else { skipNode('now'); }
      return;
    }
    if (route.name === 'o') {
      if (!has) { skipNode(node); return; }
      if (node === 'others') { leaveOthers(); return; }
      o = (F[node].options || []).filter(function (t) { return (t.value || t.text) === S.flow[node] || t.text === S.flow[node]; })[0];
      goNext(o ? o.go : null, []);
      return;
    }
    x = Q[route.i]; a = answer(x.id);
    if (!has) { skipNode(node); return; }
    if (x.kind === 'people') { leavePeople(); return; }
    if (x.kind === 'choice') { goNext(x.next, a.picks); return; }
    if (a.st === 'none') { goNext(x.next, ['none']); return; }
    leaveAnswer();
  }

  /* --- 第四版的三題 --- */

  function chooseOrigin(k) {
    var o = F.origin.options[k];
    S.flow.origin = o.value || o.text;
    goNext(o.go, []);
  }

  function chooseWorry(k) {
    var o = F.worry.options[k];
    S.flow.worry = o.text;
    goNext(o.go, []);
  }

  function leaveOthers() {
    S.flow.othersDone = 1;
    goNext(F.others.go, S.flow.others);
  }

  /* --- 陪伴紀錄 --- */

  function fieldError(inputId, errId, msg) {
    var input = $(inputId), err = $(errId);
    err.textContent = msg;
    err.hidden = !msg;
    if (msg) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', errId); }
    else { input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); }
    return !!msg;
  }

  function addLog() {
    var who = $('log-who'), did = $('log-did');
    var badWho = fieldError('log-who', 'err-who', who.value.trim() ? '' : C.out.logErrWho);
    var badDid = fieldError('log-did', 'err-did', did.value.trim() ? '' : C.out.logErrDid);
    if (badWho || badDid) { (badWho ? who : did).focus(); return; }
    var t = new Date();
    S.log.push({ who: who.value.trim(), did: did.value.trim(), found: $('log-new').value.trim(),
      d: t.getFullYear() + '/' + (t.getMonth() + 1) + '/' + t.getDate() });
    save();
    render(true, '#log-title');
    say(C.out.logAdded);
  }

  function clearAll() {
    if (!window.confirm(C.out.clearConfirm)) { return; }
    var big = S.big;
    S = emptyState();
    S.big = big;
    save();
    houseMode = 'all'; houseWhen = 'now';
    go('#/home', C.out.cleared);
  }

  /* --- 按鈕 --- */

  var ACTIONS = {
    status: function (b) { chooseStatus(b.getAttribute('data-s')); },
    origin: function (b) { chooseOrigin(+b.getAttribute('data-k')); },
    worry: function (b) { chooseWorry(+b.getAttribute('data-k')); },
    choice: function (b) { chooseOption(+b.getAttribute('data-k')); },
    mode: function (b) { switchMode(b.getAttribute('data-m')); },
    /* 階段條：點別的階段 → 只重畫階段條那一塊，出現「確認／取消」 */
    /* 白天／晚上不變；「以後」是開關，再按一次回到現在（還沒填階段的時候，階段條上沒有「現在」那一顆） */
    when: function (b) { var w = b.getAttribute('data-when'); switchMode('', w !== 'now' && houseWhen !== w ? w : 'now'); },
    fwd: forward,
    noteTab: function (b) { noteActive = b.getAttribute('data-k'); redrawNotes(true); },
    res: function (b) { openRes(b.getAttribute('data-id')); },
    tile: function (b) { openTile(b.getAttribute('data-page'), b.getAttribute('data-id')); },
    print: function () { window.print(); },
    share: function (b) { shareImage(b.getAttribute('data-doc') || 'day'); },
    shareText: function (b) { shareText(b.getAttribute('data-doc') || 'day'); },
    addLog: addLog,
    logMore: function () { logView.all = true; $('log-list').innerHTML = logList(); var r = app.querySelectorAll('#log-list .row')[LOG_SHOW]; if (r) { r.setAttribute('tabindex', '-1'); r.focus(); } },
    win: function (b) { openWin(+b.getAttribute('data-k'), b); },
    instKind: function (b) {   /* 選一種：只換下面那一塊，焦點留在這顆 */
      var id = b.getAttribute('data-k');
      resKind = resKind === id ? '' : id;
      var item = C.resources.items.filter(function (x) { return x.id === resOpen; })[0];
      $('inst-list').innerHTML = instList(resKinds(item));
      var again = app.querySelector('[data-act=instKind][data-k="' + id + '"]'); if (again) { again.focus(); }
    },
    he: function (b) { openDlg('<h2 id="win-dlg-h">' + esc(C.home.heTitle) + '</h2><p class="stage-line dlg-stage">' + stageInfo('btn ghost').html + '</p>', b); },
    clear: clearAll
  };

  /* 點窗：瀏覽器內建的對話框（Esc 或「關閉」關掉，焦點回到那扇窗）。同樣的內容在「陪伴他的人」那一頁也看得到 */
  function openWin(k, from) {
    var p = tapP[k], K = C.circle;
    if (!p) { return; }
    var title = p.who ? p.n.split('：')[0] : p.n;
    var h = '<h2 id="win-dlg-h">' + esc(title) + '</h2>' + (p.s === 'on' ? '' : '<p class="who-state"><span class="swatch ' + p.s + '" aria-hidden="true"></span>' + esc(p.label || stateName(p.s)) + '</p>');
    if (p.who) { h += '<ul class="win-who">' + p.who.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>'; }
    if (p.why) { h += '<p class="sub">' + esc(p.why) + '</p>'; }
    openDlg(h, from, p.go ? '<a class="btn ghost" href="' + p.go + '">' + esc(p.goLabel || K.edit) + '</a>' : '');
  }

  function openDlg(h, from, btns) {
    var d = $('win-dlg');
    if (!d) { d = document.createElement('dialog'); d.id = 'win-dlg'; d.className = 'win-dlg'; d.setAttribute('aria-labelledby', 'win-dlg-h'); document.body.appendChild(d); }
    d.innerHTML = h + '<p class="win-btns">' + (btns || '') + '<button type="button" class="btn primary" data-close>' + esc(C.circle.winClose) + '</button></p>';
    d.onclick = function (e) { if (e.target === d || e.target.closest('[data-close]') || e.target.closest('a')) { d.close(); } };
    /* 瀏覽器關掉對話框時會自己把焦點還回去；沒還（舊瀏覽器）才補，免得蓋掉使用者接著按的地方 */
    d.onclose = function () { var f = document.activeElement; if (from && document.body.contains(from) && (!f || f === document.body || d.contains(f))) { from.focus(); } };
    if (d.showModal) { d.showModal(); } else { d.setAttribute('open', ''); }
    var c = d.querySelector('[data-close]'); if (c) { c.focus(); }
  }

  app.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-act]') : null;
    if (b && ACTIONS[b.getAttribute('data-act')]) { ACTIONS[b.getAttribute('data-act')](b); }
  });

  /* --- 點選項 --- */

  /* 多選：把值加進或拿出清單 */
  function toggleIn(list, value, on) {
    var p = list.indexOf(value);
    if (on && p < 0) { list.push(value); }
    if (!on && p >= 0) { list.splice(p, 1); }
  }

  /* 讓外觀（粗框、打勾）跟上實際有沒有選到 */
  function syncPicks(group) {
    Array.prototype.forEach.call(group.querySelectorAll('.pick'), function (l) {
      l.classList.toggle('is-on', l.querySelector('input').checked);
    });
  }

  app.addEventListener('change', function (e) {
    var el = e.target;
    if (el.id === 'inst-county' || el.id === 'win-county') {   /* 選縣市：只換下面的名單（窗口和機構兩塊用同一個縣市） */
      resCounty = el.value;
      var item = C.resources.items.filter(function (x) { return x.id === resOpen; })[0];
      var ks = resKinds(item);
      if ($('inst-list')) { $('inst-list').innerHTML = instList(ks); }
      if ($('win-list')) { $('win-list').innerHTML = winList(item); }
      ['inst-county', 'win-county'].forEach(function (id) { if ($(id) && id !== el.id) { $(id).value = resCounty; } });
      return;
    }
    if (el.id === 'log-from' || el.id === 'log-to' || el.id === 'log-whof') {   /* 誰陪過他：只換下面的清單，焦點留在選單 */
      if (el.id === 'log-whof') { logView.who = el.value === '0' ? '' : el.value; } else { logView[el.id === 'log-from' ? 'from' : 'to'] = +el.value; }
      logView.all = false; $('log-list').innerHTML = logList(); return;
    }
    if (el.id === 'born') {   /* 出生年：重畫這一頁（下面那一句跟著變），焦點留在選單 */
      S.now.born = el.value; S.now.shift = 0; stampNow(); save(); render(true, '#born'); return;
    }
    if (el.type !== 'checkbox' && el.type !== 'radio') { return; }
    if (route.name === 'now') {
      if (el.name === 'stage') { setStage(el.value); } else { toggleIn(S.now[el.name], el.value, el.checked); }
      if (el.name === 'help' || el.name === 'care') { if (el.checked) { noteActive = el.value; } else if (noteActive === el.value) { noteActive = ''; } redrawNotes(false); }
    } else if (route.name === 'o') {
      if (el.name === 'others') { toggleIn(S.flow.others, el.value, el.checked); }
    } else if (route.name === 'q') {
      var a = answer(Q[route.i].id);
      if (el.name === 'picks') {
        toggleIn(a.picks, el.value, el.checked);
        if (el.checked) { noteActive = el.value; } else if (noteActive === el.value) { noteActive = ''; }   /* 剛勾的那一個換到框裡；取消的是框裡那一個 → 換成最後勾的 */
        redrawNotes(false);
      }
      if (el.name === 'sub') { a.sub = el.value; }
      if (el.name === 'picks2') { toggleIn(a.picks2, el.value, el.checked); }
      if (el.name === 'share') { a.share = el.checked; }
    }
    save();
    syncPicks(el.closest('fieldset') || el.parentNode.parentNode);
    updateFwd();
  });

  /* --- 焦點不要被固定在上方的頁首蓋住（WCAG 2.4.11） ---
     Chrome 靠 CSS 的 scroll-padding 就會避開；Safari 用 Tab 移動焦點時不理它，所以這裡再補一次 */
  var byKeyboard = false;   /* 只在用鍵盤移動焦點時補捲；用手點的時候捲動會讓那一下點歪 */
  document.addEventListener('keydown', function (e) { if (e.key === 'Tab') { byKeyboard = true; } });
  document.addEventListener('pointerdown', function () { byKeyboard = false; });

  app.addEventListener('focusin', function (e) {
    var bar = $('topbar');
    if (!byKeyboard || !bar || window.getComputedStyle(bar).position !== 'sticky') { return; }
    var box = (e.target.closest('label') || e.target).getBoundingClientRect();
    var over = bar.getBoundingClientRect().bottom - box.top;
    if (over > 0) { window.scrollBy(0, -(over + 12)); }
  });

  /* --- 打字：邊打邊存 --- */

  var TEXT_FIELDS = { 'f-text': 'text', 'f-tch': 'tch', 'f-next': 'next' };

  app.addEventListener('input', function (e) {
    var el = e.target;
    if (el.tagName !== 'TEXTAREA') { return; }
    if (route.name === 'q' && TEXT_FIELDS[el.id]) { answer(Q[route.i].id)[TEXT_FIELDS[el.id]] = el.value; save(); }
    if (route.name === 'q' && el.getAttribute('data-pick')) { answer(Q[route.i].id).names[el.getAttribute('data-pick')] = el.value; save(); }
    if (route.name === 'now' && el.getAttribute('data-note')) { S.now[NOW_PARTS[route.part] + 'Notes'][el.getAttribute('data-note')] = el.value; save(); }
    if (el.id === 'now-stage') { S.now.stageText = el.value; save(); }
    if (el.id === 'now-care') { S.now.careText = el.value; save(); }
    if (route.name === 'q' && el.getAttribute('data-note')) { answer(Q[route.i].id).notes[el.getAttribute('data-note')] = el.value; save(); }
    if (route.name === 'q' && el.id === 'f-text' && !Q[route.i].options && !Q[route.i].kind) {   /* 只有一格字的題目：寫了就算想好了 */
      var a1 = answer(Q[route.i].id); a1.st = a1.text.trim() ? 'done' : ''; save();
    }
    if (el.id === 'f-others') { S.flow.othersText = el.value; save(); }
    updateFwd();
    if (el.getAttribute('data-res')) { S.res[el.getAttribute('data-res')] = el.value; save(); }
  });

  /* ============ 7. 啟動 ============ */

  function showStorageNotice() {
    $('notice').textContent = C.app.noStorage;
    $('notice').hidden = storageOk;
  }

  function setupFrame() {
    $('skip').textContent = C.app.skipLink;
    $('big-label').textContent = C.app.bigText;
    /* 跟著系統的時候，系統換了深淺色，按鈕上的「開／關」也跟著換 */
    try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch (e) { /* 舊瀏覽器沒有 */ }
    $('speak-label').textContent = C.app.speakPage;
    if (canSpeak()) { try { window.speechSynthesis.getVoices(); } catch (e) { /* 先叫一次，讓瀏覽器開始載入語音清單 */ } }
    if (!canSpeak()) { $('speak').hidden = true; }   /* 這台裝置沒有朗讀功能：不放一顆按了沒反應的按鈕 */

    /* 「跳到主要內容」：只移焦點，不改網址（網址 # 是拿來換頁的） */
    $('skip').addEventListener('click', function (e) {
      e.preventDefault();
      (app.querySelector('h1') || app).focus();
    });
    $('speak').addEventListener('click', toggleSpeak);
    $('theme-label').textContent = C.app.darkText;
    applyTheme();
    $('theme').addEventListener('click', toggleTheme);
    if (window.matchMedia) {   /* 沒自己選過：系統換了深淺，按鈕上的開／關跟著改（只改字，不改主題） */
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) { mq.addEventListener('change', applyTheme); } else if (mq.addListener) { mq.addListener(applyTheme); }
    }
    $('big').addEventListener('click', function () {
      S.big = S.big ? 0 : 1;
      applyBig();
      save();   /* 同上：不跳「字已經放大」 */
    });
  }

  /* 測一次能不能寫入，不能就先講（例如無痕模式、儲存空間被關掉） */
  function testStorage() {
    try { window.localStorage.setItem(KEY + '-test', '1'); window.localStorage.removeItem(KEY + '-test'); }
    catch (e) { storageOk = false; }
  }

  window.addEventListener('hashchange', onRouteChange);
  window.addEventListener('pagehide', stopSpeaking);

  try {
    testStorage();
    setupFrame();
    applyBig();
    showStorageNotice();
    render(false);
  } catch (e) { contentBroken(e); }
})();
