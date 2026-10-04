(function(root){
 function parse(text){const rows=[];let row=[],value='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(value);value='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);rows.push(row);row=[];value='';}else value+=c;}if(quoted)throw Error('Incomplete spreadsheet response');if(value.length||row.length){row.push(value);rows.push(row);}return rows;}
 root.CTD_LEAGUE_CSV={parse};
})(typeof window!=='undefined'?window:globalThis);
