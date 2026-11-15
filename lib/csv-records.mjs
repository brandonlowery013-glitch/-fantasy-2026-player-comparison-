// Yield records without retaining every row/object from a season's wide PBP CSV.
export function* csvRecords(text){
 let header=null,row=[],field='',quoted=false;
 const record=fields=>Object.fromEntries(header.map((key,index)=>[key,fields[index]??'']));
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"')quoted=false;else field+=c;}
  else if(c==='"')quoted=true;
  else if(c===','){row.push(field);field='';}
  else if(c==='\n'){
   row.push(field.replace(/\r$/,''));
   if(header===null)header=row;else if(row.length>1)yield record(row);
   row=[];field='';
  }else field+=c;
 }
 if(field.length||row.length){row.push(field);if(header!==null&&row.length>1)yield record(row);}
}
