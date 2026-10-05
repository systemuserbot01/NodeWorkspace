let greetingTimer=null;
let greetingInitialized=false;

function greetingForHour(hour){
  if(hour>=5&&hour<19)return"Buenos días";
  return"Buenas noches";
}

export function renderInitialGreeting(profileName="Usuario"){
  const view=document.getElementById("initialGreetingView");if(!view)return;
  const name=view.querySelector("[data-greeting-name]");
  const greeting=view.querySelector("[data-greeting-text]");
  if(name)name.textContent=String(profileName||"Usuario").trim()||"Usuario";
  if(greeting)greeting.textContent=greetingForHour(new Date().getHours());
}

export function showInitialGreeting(profileName="Usuario"){
  const view=document.getElementById("initialGreetingView");if(!view)return;
  document.querySelectorAll(".workspace-view").forEach(item=>{item.hidden=item!==view;item.classList.toggle("active",item===view)});
  document.querySelectorAll("[data-workspace-view],.custom-workspace-link").forEach(button=>button.classList.toggle("active",button.dataset.workspaceView==="greeting"));
  renderInitialGreeting(profileName);
  const topTitle=document.querySelector(".top-title");if(topTitle)topTitle.textContent="Inicio";
  document.title="Inicio — Node Workspace";
  document.body.classList.remove("sidebar-open");
  document.getElementById("workspaceMenu")?.setAttribute("aria-expanded","false");
  window.scrollTo({top:0,behavior:"auto"});
}

export function initInitialGreeting(getProfileName=()=>"Usuario"){
  renderInitialGreeting(getProfileName());
  clearInterval(greetingTimer);
  greetingTimer=setInterval(()=>renderInitialGreeting(getProfileName()),60000);
  if(!greetingInitialized){
    document.addEventListener("workspace:viewchange",event=>{if(event.detail?.view==="greeting")renderInitialGreeting(getProfileName())});
    greetingInitialized=true;
  }
}
