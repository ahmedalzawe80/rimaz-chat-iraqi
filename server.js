function header(active){
 return `<header class="top">
 <div class="user">
   <div class="ava">👤</div>
   <span>${esc(me.name)}${me.type==="guest"?" (زائر)":""}</span>
 </div>

 <div class="logo">دردشة <span>ريماز عراقية</span></div>

 <nav class="nav">
   <button class="${active==="rooms"?"on":""}" onclick="show('rooms')">الغرف</button>
   <button class="${active==="private"?"on":""}" onclick="show('private')">الخاص</button>
   <button class="${active==="members"?"on":""}" onclick="show('members')">الأعضاء</button>
   <button class="${active==="wall"?"on":""}" onclick="show('wall')">الحائط</button>

   <button class="bell" onclick="notificationsView()">
     🔔 الإشعارات
     <span id="bellCount" class="bell-count" style="display:none">0</span>
   </button>

   <button onclick="settings()">⚙ الضبط</button>
 </nav>
 </header>`;
}
