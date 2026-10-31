import {expect,test} from 'playwright/test';

test.beforeEach(async({page})=>{
  await page.goto('/__framework-tests/navigation/adaptive');
  await page.getByTestId('navigation-state').waitFor();
  await page.evaluate(async()=>{
    const sharePath='/src/SynCloudOS/AppSDK/mountedShareClient.ts';
    const panelsPath='/src/SynCloudOS/AppSDK/mountedFilePanelClient.ts';
    const downloadPath='/src/SynCloudOS/PlatformAdapters/BrowserDownloadFilePanelPort.ts';
    const [{createMountedShareClient},{createMountedFilePanelClient},{createBrowserDownloadFilePanelPort}]=await Promise.all([import(sharePath),import(panelsPath),import(downloadPath)]);
    const owner=new AbortController();
    const browser={getNavigator:()=>navigator,getWindow:()=>window,getDocument:()=>document,getLocation:()=>({href:location.href,origin:location.origin,pathname:location.pathname,search:location.search,hash:location.hash})};
    // Generated host harness: no browser permission override and no personal data.
    const share=createMountedShareClient({browser,signal:owner.signal,assertLive:()=>owner.signal.throwIfAborted(),access:()=>({declared:true,allowed:true})});
    const panels=createMountedFilePanelClient({signal:owner.signal,assertLive:()=>owner.signal.throwIfAborted(),activation:()=>navigator.userActivation?.isActive,access:()=>({declared:true,allowed:true}),download:createBrowserDownloadFilePanelPort(window)});
    const request={id:'generated-export',accepts:[],suggestedName:'syncloudos-generated.txt',destination:'handle-or-download',conflictPolicy:'fail-if-exists'};
    const output=document.createElement('output');output.id='generated-capability-output';
    const button=document.createElement('button');button.id='generated-export-button';button.textContent='Export generated fixture';
    button.addEventListener('click',async()=>{
      const selected=await panels.save(request);if(selected.kind!=='accepted'){output.textContent=selected.kind;return;}
      const result=await selected.values[0].sink.write({fileName:'syncloudos-generated.txt',mediaType:'text/plain',blob:new Blob(['Generated SynCloudOS capability fixture\n'],{type:'text/plain'})});output.textContent=result.kind;
    },{signal:owner.signal});
    const revoke=document.createElement('button');revoke.id='generated-revoke-button';revoke.textContent='Revoke generated export';
    revoke.addEventListener('click',async()=>{
      const selected=await panels.save(request);owner.abort();
      if(selected.kind!=='accepted'){output.textContent=selected.kind;return;}
      try{await selected.values[0].sink.write({fileName:'never.txt',mediaType:'text/plain',blob:new Blob(['never'])});output.textContent='unexpected';}
      catch(error){output.textContent=(error as {code?:string}).code??'error';}
    },{signal:owner.signal});
    document.body.prepend(button,revoke,output);
    Object.assign(window,{generatedCapabilities:{share,panels,owner,request}});
  });
});

test('generated export uses the actual browser download and removes temporary anchors',async({page})=>{
  const downloadPromise=page.waitForEvent('download');await page.locator('#generated-export-button').click();
  const download=await downloadPromise;expect(download.suggestedFilename()).toBe('syncloudos-generated.txt');
  const stream=await download.createReadStream();if(!stream)throw Error('Missing generated download');
  const chunks:Buffer[]=[];for await(const chunk of stream)chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString('utf8')).toBe('Generated SynCloudOS capability fixture\n');
  await expect(page.locator('#generated-capability-output')).toHaveText('exported');
  expect(await page.locator('a[download]').count()).toBe(0);
});

test('revoked targets cannot dispatch a download',async({page})=>{
  let downloads=0;page.on('download',()=>downloads++);
  await page.locator('#generated-revoke-button').click();
  await expect(page.locator('#generated-capability-output')).toHaveText('operation-aborted');expect(downloads).toBe(0);
});

test('real browser activation expires without being manufactured by status queries',async({page},testInfo)=>{
  const result=await page.evaluate(()=>new Promise(resolve=>{
    setTimeout(async()=>{
      const harness=(window as unknown as {generatedCapabilities:{share:{getStatus():unknown;perform(request:unknown):Promise<unknown>}}}).generatedCapabilities;
      const active=navigator.userActivation?.isActive??null;
      const status=harness.share.getStatus();
      const result=await harness.share.perform({title:'Generated fixture',text:'Generated public test text'});
      resolve({active,status,result});
    },6200);
  }));
  const facts=result as {active:boolean;status:{availability:string};result:{kind:string;reason?:string}};
  await testInfo.attach('native-availability-and-expired-activation',{body:JSON.stringify(result),contentType:'application/json'});
  expect(facts.active).toBe(false);
  if(facts.status.availability==='unsupported')expect(facts.result.kind).toBe('unsupported');
  else expect(facts.result).toEqual({kind:'denied',reason:'activation'});
});
