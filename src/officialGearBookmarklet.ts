export type OfficialGearBookmarkletMessages = {
  noGearData: string;
  copyPrompt: string;
  copySuccess: string;
  notLoggedIn: string;
  unreadableData: string;
  dashboardUnreachable: string;
};

const defaultMessages: OfficialGearBookmarkletMessages = {
  noGearData: "The dashboard returned no gear data.",
  copyPrompt: "Copy this, then paste it into Where Builds Meet:",
  copySuccess: "Complete role data copied. Paste it into Where Builds Meet.",
  notLoggedIn: "Not logged in. Open the official dashboard, sign in, then run this bookmark again.",
  unreadableData: "The dashboard returned unreadable data.",
  dashboardUnreachable: "Could not reach the dashboard.",
};

// Runs on the official dashboard, so keep the generated source ES5-compatible and dependency-free.
export function createOfficialGearBookmarklet(messageOverrides: Partial<OfficialGearBookmarkletMessages> = {}) {
  const messages = { ...defaultMessages, ...messageOverrides };
  const bookmarkletSource = `(function(){var M=${JSON.stringify(messages)},D='https://s2.easebar.com/78ae9d90792a3e9b/role/roleInfo',K='h72na_data_token';function done(r){var d=r&&r.data?r.data:r;if(!d||!d.wearEquipsDetailed){alert(M.noGearData);return}var o={source:'wwm-dashboard',v:2,capturedAt:new Date().toISOString(),roleInfo:d},s=JSON.stringify(o);function fallback(){prompt(M.copyPrompt,s)}if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(s).then(function(){alert(M.copySuccess);},fallback);else fallback()}var c=null;try{c=JSON.parse(localStorage.getItem('getAreaServer')||'null')}catch(e){}if(c&&c.wearEquipsDetailed){done(c);return}var t=null;try{t=localStorage.getItem(K)}catch(e){}if(!t){var m=/(?:^|;\\s*)token=([^;]+)/.exec(document.cookie||'');if(m)t=m[1]}if(!t){alert(M.notLoggedIn);return}var x=new XMLHttpRequest();x.open('GET',D,true);x.withCredentials=true;x.setRequestHeader('access_token',t);x.onload=function(){try{done(JSON.parse(x.responseText))}catch(e){alert(M.unreadableData)}};x.onerror=function(){alert(M.dashboardUnreachable)};x.send()})()`;
  return `javascript:${encodeURIComponent(bookmarkletSource)}`;
}

export const officialGearBookmarklet = createOfficialGearBookmarklet();
