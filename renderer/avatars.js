'use strict';
/* =========================================================================
   Profile avatars (1.10): sixteen line drawings in the app's icon style, each on a brand-tinted disc
   (copper, evergreen or sand). Colours come from CSS variables, so every avatar follows the Light / Dark theme.
   Saved in settings.avatar as a short id ("fox"); avatars picked in older versions (emoji) map to the closest one.
   ========================================================================= */
const AV_DRAW={
  smile:'<circle cx="20" cy="20" r="10"/><path d="M15.8 22.4a5 5 0 0 0 8.4 0"/><circle class="f" cx="16.6" cy="17.6" r="1.25"/><circle class="f" cx="23.4" cy="17.6" r="1.25"/>',
  cool:'<circle cx="20" cy="20" r="10"/><path class="f" d="M12.6 16.4h14.8v1.4l-.6 2.2a2.4 2.4 0 0 1-2.3 1.7h-.8a2.4 2.4 0 0 1-2.3-1.8l-.2-.8h-1.4l-.2.8a2.4 2.4 0 0 1-2.3 1.8h-.8a2.4 2.4 0 0 1-2.3-1.7l-.6-2.2z"/><path d="M16.6 24.6q3.4 1.9 6.8 0"/>',
  cat:'<path d="M11.5 22.5c0 4.4 3.8 7 8.5 7s8.5-2.6 8.5-7V11l-5 3.6a10 10 0 0 0-7 0l-5-3.6z"/><circle class="f" cx="16.4" cy="20.6" r="1.25"/><circle class="f" cx="23.6" cy="20.6" r="1.25"/><path d="M18.8 23.6h2.4L20 25zM20 25v1.2M8.5 22.5l4 .5M8.8 26l3.8-1.2M31.5 22.5l-4 .5M31.2 26l-3.8-1.2"/>',
  fox:'<path d="M10 11l4.4 4.2h11.2L30 11l-1 9.4L20 30l-9-9.6z"/><path d="M14.4 22.2L20 26l5.6-3.8"/><circle class="f" cx="16.4" cy="19.4" r="1.2"/><circle class="f" cx="23.6" cy="19.4" r="1.2"/><circle class="f" cx="20" cy="28" r="1.3"/>',
  bear:'<circle cx="13" cy="12.6" r="3.2"/><circle cx="27" cy="12.6" r="3.2"/><circle cx="20" cy="21" r="9.4"/><ellipse cx="20" cy="24.4" rx="4.2" ry="3.2"/><circle class="f" cx="16.3" cy="18.8" r="1.2"/><circle class="f" cx="23.7" cy="18.8" r="1.2"/><path class="f" d="M18.6 23.2h2.8L20 24.8z"/>',
  owl:'<path d="M11.5 12.5l3.4 2.3a9 9 0 0 1 10.2 0l3.4-2.3V23a8.5 8.5 0 0 1-17 0z"/><circle cx="16.4" cy="19.6" r="2.9"/><circle cx="23.6" cy="19.6" r="2.9"/><circle class="f" cx="16.4" cy="19.6" r="1"/><circle class="f" cx="23.6" cy="19.6" r="1"/><path d="M18.8 23.4L20 25.4l1.2-2"/>',
  sprout:'<path d="M20 30V18.5"/><path d="M20 21c-6.2 0-9-3.4-9-8.4 6.2 0 9 3.4 9 8.4zM20 18.5c0-4.6 2.6-7.8 8.6-7.8 0 4.6-2.6 7.8-8.6 7.8z"/><path d="M14 30h12"/>',
  leaf:'<path d="M11 29c0-11 6-17.6 18-18 .4 12-6.4 18-18 18z"/><path d="M11 29l10.6-10.6"/>',
  sun:'<circle cx="20" cy="20" r="5.2"/><path d="M20 9.4v2.4M20 28.2v2.4M9.4 20h2.4M28.2 20h2.4M12.5 12.5l1.7 1.7M25.8 25.8l1.7 1.7M12.5 27.5l1.7-1.7M25.8 14.2l1.7-1.7"/>',
  moon:'<path d="M27.6 23.8A9.6 9.6 0 1 1 18 10.6a7.6 7.6 0 0 0 9.6 13.2z"/><path class="f" d="M26.4 11.4l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6z"/>',
  star:'<path d="M20 10.4l2.9 6 6.5.9-4.7 4.6 1.1 6.5L20 25.3l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z"/>',
  rocket:'<path d="M20 9.6c3.6 2.6 5.2 6.4 5 11.6l-1.8 3.2h-6.4L15 21.2c-.2-5.2 1.4-9 5-11.6z"/><circle cx="20" cy="17.4" r="2.2"/><path d="M15.2 20.6l-3 3.4.6 3.4 4.2-3M24.8 20.6l3 3.4-.6 3.4-4.2-3M18.2 27.4L20 31l1.8-3.6"/>',
  headphones:'<path d="M11 24v-3.4a9 9 0 0 1 18 0V24"/><rect x="9.6" y="22.4" width="5.2" height="7.6" rx="2.2"/><rect x="25.2" y="22.4" width="5.2" height="7.6" rx="2.2"/>',
  coffee:'<path d="M11.4 17h14.2v6.2a6 6 0 0 1-6 6h-2.2a6 6 0 0 1-6-6z"/><path d="M25.6 18.6h1.6a3 3 0 0 1 0 6h-1.8M16 10.4q-1.2 1.6 0 3.2M20.4 10.4q-1.2 1.6 0 3.2"/>',
  mountain:'<path d="M8.6 29l8-12.6 4.6 7.2 2.8-4.2 7.4 9.6z"/><path d="M13.6 21.4l3 1.8 2.4-1.6"/><circle cx="26.4" cy="12.4" r="2.4"/>',
  heart:'<path d="M20 28.6s-9-5.2-9-11.4a4.8 4.8 0 0 1 9-2.4 4.8 4.8 0 0 1 9 2.4c0 6.2-9 11.4-9 11.4z"/>'
};
/* order shown in the picker; tones alternate so the grid reads as one palette */
const AVATARS=['smile','cool','fox','cat','bear','owl','sprout','leaf','sun','moon','star','rocket','headphones','coffee','mountain','heart'];
const AV_TONE={smile:'cu',cool:'ev',fox:'cu',cat:'sa',bear:'ev',owl:'sa',sprout:'ev',leaf:'ev',sun:'cu',moon:'sa',star:'cu',rocket:'ev',headphones:'sa',coffee:'cu',mountain:'ev',heart:'cu'};
const AV_LEGACY={'🙂':'smile','😎':'cool','🦊':'fox','🐼':'bear','🐱':'cat','🐶':'bear','🦄':'star','🌻':'sun','🚀':'rocket','🎧':'headphones','☕':'coffee','🌈':'mountain','🍀':'leaf','⭐':'star','🦋':'sprout','🐙':'owl'};
const avId=a=>AV_DRAW[a]?a:(AV_LEGACY[a]||'smile');
function avSvg(id){id=avId(id);return`<svg class="av-g" viewBox="0 0 40 40" aria-hidden="true" focusable="false">${AV_DRAW[id]}</svg>`;}
function avatarHtml(size=36){
  const s=S.settings,st=`width:${size}px;height:${size}px`,lbl=esc(tr('set.avatar'));
  if(s.photo)return`<div class="avatar photo" role="img" aria-label="${lbl}" style="${st};background-image:url(${s.photo})"></div>`;
  const id=avId(s.avatar);
  return`<div class="avatar av-${AV_TONE[id]}" role="img" aria-label="${lbl}" style="${st}">${avSvg(id)}</div>`;
}
/* Photo -> 256 px square JPEG, centre-cropped. Transparent areas become brand Sand (not black), which reads well in both themes. */
function resizePhoto(file){
  return new Promise((res,rej)=>{
    if(!file||!/^image\//.test(file.type||'image/'))return rej(new Error('not an image'));
    if(file.size>25*1024*1024)return rej(new Error('too large'));
    const url=URL.createObjectURL(file),im=new Image();
    im.onerror=()=>{URL.revokeObjectURL(url);rej(new Error('unreadable'));};
    im.onload=()=>{
      try{
        const N=256,c=document.createElement('canvas');c.width=c.height=N;const g=c.getContext('2d');
        const w=im.naturalWidth||im.width||N,h=im.naturalHeight||im.height||N,m=Math.min(w,h);
        g.fillStyle='#E8DFD3';g.fillRect(0,0,N,N);
        g.imageSmoothingQuality='high';g.drawImage(im,(w-m)/2,(h-m)/2,m,m,0,0,N,N);
        res(c.toDataURL('image/jpeg',.86));
      }catch(e){rej(e);}finally{URL.revokeObjectURL(url);}
    };
    im.src=url;
  });
}
