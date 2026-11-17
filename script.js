const menuToggle=document.querySelector('.menu-toggle');
const navigation=document.querySelector('#navigation');
function closeMenu(){menuToggle.setAttribute('aria-expanded','false');navigation.classList.remove('open');}
menuToggle.addEventListener('click',()=>{const open=menuToggle.getAttribute('aria-expanded')!=='true';menuToggle.setAttribute('aria-expanded',String(open));navigation.classList.toggle('open',open);});
navigation.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeMenu));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&navigation.classList.contains('open')){closeMenu();menuToggle.focus();}});
document.querySelectorAll('[data-filling]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-filling]').forEach(other=>other.setAttribute('aria-pressed',String(button===other)));document.querySelectorAll('[data-kind]').forEach(item=>item.hidden=button.dataset.filling!=='all'&&button.dataset.filling!==item.dataset.kind);}));
document.querySelectorAll('[data-day]').forEach(button=>button.addEventListener('click',()=>{const day=button.dataset.day;document.querySelectorAll('[data-day]').forEach(other=>other.setAttribute('aria-pressed',String(button===other)));let count=0;document.querySelectorAll('[data-market-days]').forEach(card=>{card.hidden=day!=='All week'&&!card.dataset.marketDays.split(',').includes(day);if(!card.hidden)count++;card.querySelectorAll('[data-hours-day]').forEach(row=>row.hidden=day!=='All week'&&row.dataset.hoursDay!==day);});document.querySelector('#market-count').textContent=`${count} ${count===1?'location':'locations'} · ${day}`;}));
document.querySelector('#year').textContent=new Date().getFullYear();
const shortcuts=document.querySelector('.scroll-shortcuts'),down=document.querySelector('#scroll-bottom');let pending=false;
function updateShortcuts(){const bottom=Math.max(0,document.documentElement.scrollHeight-innerHeight);shortcuts.hidden=scrollY<240||bottom<240;down.disabled=scrollY>=bottom-8;pending=false;}
function scheduleUpdate(){if(!pending){pending=true;requestAnimationFrame(updateShortcuts);}}
function jump(top){window.scrollTo({top,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
document.querySelector('#scroll-top').addEventListener('click',()=>jump(0));down.addEventListener('click',()=>jump(document.documentElement.scrollHeight));window.addEventListener('scroll',scheduleUpdate,{passive:true});window.addEventListener('resize',scheduleUpdate);new ResizeObserver(scheduleUpdate).observe(document.body);updateShortcuts();
