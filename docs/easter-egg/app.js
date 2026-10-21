const copy = {
  zh: {
    bay: 'DSH / 秘密小海湾', lunch: '鲸鱼娘的午饭时间', fish: '今日份小鱼', feed: '投喂一条小鱼',
    full: '♡ 吃饱啦', footer: '小鱼不消耗订阅额度', alt: '等待投喂的蓝发鲸鱼娘',
    progress: '鲸鱼娘吃到的小鱼', reset: '重新投喂', again: '再喂一轮',
    hint: '再喂几条，会发生什么呢？', remaining: n => `还差 ${n} 条小鱼，就能吃饱啦。`,
    achievement: '解锁称号：鲸鱼娘的饭票',
    lines: [
      ['没吃饱喵！', '听说扫到这里的人，\n都随身带着小鱼。'],
      ['第一条，收下啦！', '谢谢你喵。\n再来一点点就好……'],
      ['是喜欢的小鱼！', '今天的运气，\n一定是蓝色的。'],
      ['开始开心了喵。', '虽然没有真的吃到，\n但心情已经变好了。'],
      ['最后一条！', '真的最后一条，\n这次我保证。'],
      ['吃饱啦，喜欢你喵！', '今日份的小鱼和好心情，\n都收到啦。'],
    ],
  },
  en: {
    bay: 'DSH / A secret little bay', lunch: 'Whale girl’s lunchtime', fish: 'Today’s little fish', feed: 'Feed her a fish',
    full: '♡ All full!', footer: 'Little fish use no subscription quota', alt: 'A blue-haired whale girl waiting for a fish',
    progress: 'Fish fed to the whale girl', reset: 'Start over', again: 'Feed her again',
    hint: 'A few more fish… what might happen?', remaining: n => `${n} more fish until she’s full.`,
    achievement: 'Title unlocked: Whale girl’s lunch sponsor',
    lines: [
      ['Still hungry, meow!', 'I hear everyone who finds this place\nhas a little fish to spare.'],
      ['First fish, all mine!', 'Thank you, meow.\nJust a little more…'],
      ['My favorite fish!', 'Today’s lucky color\nmust be blue.'],
      ['Getting happy, meow.', 'A pretend fish,\na real little smile.'],
      ['One last fish!', 'Really, the very last one.\nI promise this time.'],
      ['All full. Love you, meow!', 'A little fish, a little joy.\nThank you for both.'],
    ],
  },
};
const params = new URLSearchParams(location.search);
const requested = params.get('lang');
let lang = requested === 'en' || requested === 'zh' ? requested : navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
let fish = 0;
const get = id => document.getElementById(id);
const feed = get('feed'), reset = get('reset'), mascot = get('mascot'), progress = get('progress');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
function render() {
  const t = copy[lang];
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.title = `${t.lunch} · DSH`;
  document.querySelector('main').setAttribute('aria-label', t.progress);
  document.querySelectorAll('[data-copy]').forEach(node => { node.textContent = t[node.dataset.copy]; });
  get('title').textContent = t.lines[fish][0];
  get('subtitle').textContent = t.lines[fish][1];
  get('count').textContent = `${fish} / 5`;
  mascot.alt = t.alt;
  progress.setAttribute('aria-label', t.progress);
  progress.setAttribute('aria-valuenow', String(fish));
  [...progress.children].forEach((slot, i) => slot.classList.toggle('egg-fed', i < fish));
  feed.disabled = fish === 5;
  reset.disabled = fish === 0;
  reset.setAttribute('aria-label', fish === 5 ? t.again : t.reset);
  get('full').hidden = fish < 5;
  get('achievement').textContent = fish === 5 ? t.achievement : fish === 0 ? t.hint : t.remaining(5 - fish);
  get('achievement').classList.toggle('egg-unlocked', fish === 5);
  get('language').textContent = lang === 'zh' ? 'EN' : '中文';
  get('language').lang = lang === 'zh' ? 'en' : 'zh-CN';
  get('language').setAttribute('aria-label', lang === 'zh' ? 'Switch to English' : '切换到中文');
  get('project').href = `https://github.com/WSL043/dsh-codex-subscription/blob/main/README${lang === 'en' ? '.en' : ''}.md`;
}
feed.addEventListener('click', () => {
  if (fish === 5) return;
  fish++;
  render();
  if (reducedMotion.matches) return;
  mascot.classList.remove('egg-jump');
  void mascot.offsetWidth;
  mascot.classList.add('egg-jump');
  const particle = document.createElement('span');
  particle.className = 'egg-flying-fish';
  particle.textContent = '🐟';
  particle.setAttribute('aria-hidden', 'true');
  document.querySelector('main').append(particle);
  setTimeout(() => particle.remove(), 650);
});
reset.addEventListener('click', () => {
  fish = 0;
  mascot.classList.remove('egg-jump');
  document.querySelectorAll('.egg-flying-fish').forEach(node => node.remove());
  render();
});
get('language').addEventListener('click', () => {
  lang = lang === 'zh' ? 'en' : 'zh';
  const url = new URL(location.href);
  url.searchParams.set('lang', lang);
  history.replaceState(null, '', url);
  render();
});
render();
