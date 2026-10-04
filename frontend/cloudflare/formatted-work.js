(()=>{
 const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 window.CTD_FORMATTED_WORK=work=>window.CTD_SHOW_WORK?.renderWork(work)||'';
 const style=document.createElement('style');style.textContent='.ctdFormattedWork{line-height:1.6;font-size:14px}.ctdFormattedWork h4{margin:16px 0 5px;color:#e4effa;font-size:14px}.ctdFormattedWork p,.ctdFormattedWork li{font-size:14px;color:#b8cce0;line-height:1.6}.ctdFormattedWork ul{padding-left:20px}.ctdFormattedWork li{margin:7px 0}.ctdFormattedWork summary{color:#87c3ff;cursor:pointer}';document.head.append(style);
})();
