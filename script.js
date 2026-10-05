import dataEmojiMart from "https://cdn.jsdelivr.net/npm/@emoji-mart/data@1.2.1/+esm";
import {Picker} from "https://cdn.jsdelivr.net/npm/emoji-mart@5.6.0/+esm";
import {createClient} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import {initHumanTalent,renderHumanTalent} from "./TalentoHumano.js";
import {initInitialGreeting,showInitialGreeting} from "./SaludoInicial.js";
import {initAvatarEditor} from "./avatar.js";
import {initMentions} from "./mentions.js";
import {initTeamChat} from "./chat.js";
import {createTrashManager} from "./trash.js";

let initCustomWorkspaces=()=>{},renderCustomWorkspaces=()=>{};
try{({initCustomWorkspaces,renderCustomWorkspaces}=await import("./EspaciosTrabajo.js"))}catch(error){console.error("No se pudo cargar el módulo de espacios de trabajo:",error)}

window.NodeEmojiMart={data:dataEmojiMart,Picker};
const SUPABASE_URL="https://lolhygroimmauxpfptho.supabase.co";
const SUPABASE_PUBLIC_KEY="sb_publishable_hKBKEfKSkNbqv15KH0RR0w_zmY-xrfs";
const SUPABASE_TABLE="app_state",SUPABASE_DOCUMENT_ID="presupuesto-mensual";
const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLIC_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const defaultData={humanTalent:{sections:[]},customWorkspaces:[],privateWorkspaces:{},homePages:{},trash:[]};
let data=structuredClone(defaultData),dataReady=false,saveTimer=null,saveQueue=Promise.resolve(),currentUserId=null;
let trashManager={capture(){},setBaseline(){}};
const loginModal=document.getElementById("loginModal"),loginForm=document.getElementById("loginForm"),loginEmail=document.getElementById("loginEmail"),loginPassword=document.getElementById("loginPassword"),loginMessage=document.getElementById("loginMessage"),loginSubmit=document.getElementById("loginSubmit"),profileName=document.getElementById("profileName"),profileAvatar=document.getElementById("profileAvatar"),profileButton=document.getElementById("profileButton"),profileMenu=document.getElementById("profileMenu");

function normalizeData(source){const loaded=source&&typeof source==="object"?source:{};return{humanTalent:loaded.humanTalent&&typeof loaded.humanTalent==="object"?loaded.humanTalent:{sections:[]},customWorkspaces:Array.isArray(loaded.customWorkspaces)?loaded.customWorkspaces:[],privateWorkspaces:loaded.privateWorkspaces&&typeof loaded.privateWorkspaces==="object"&&!Array.isArray(loaded.privateWorkspaces)?loaded.privateWorkspaces:{},homePages:loaded.homePages&&typeof loaded.homePages==="object"&&!Array.isArray(loaded.homePages)?loaded.homePages:{},trash:Array.isArray(loaded.trash)?loaded.trash:[]}}
async function loadData(){const {data:stored,error}=await supabase.from(SUPABASE_TABLE).select("data").eq("id",SUPABASE_DOCUMENT_ID).maybeSingle();if(error)throw error;return normalizeData(stored?.data)}
function saveData(){if(!dataReady)return;trashManager.capture();clearTimeout(saveTimer);saveTimer=setTimeout(()=>{const snapshot=structuredClone(data);saveQueue=saveQueue.then(async()=>{const {error}=await supabase.from(SUPABASE_TABLE).upsert({id:SUPABASE_DOCUMENT_ID,data:snapshot,updated_at:new Date().toISOString()},{onConflict:"id"});if(error)console.error("No se pudo guardar en Supabase:",error)})},500)}
trashManager=createTrashManager({getData:()=>data,onChange:saveData,getUserId:()=>currentUserId});
window.addEventListener("node:trash-restored",()=>{renderHumanTalent();renderCustomWorkspaces()});
async function initializeData(){try{data=await loadData()}catch(error){console.error("No se pudieron cargar los datos:",error);data=structuredClone(defaultData)}trashManager.setBaseline(data);dataReady=true;renderHumanTalent();renderCustomWorkspaces();saveData()}
function setLoginOpen(open){document.body.classList.toggle("login-active",open);loginModal.classList.toggle("open",open);loginModal.setAttribute("aria-hidden",String(!open));if(open)setTimeout(()=>loginEmail.focus(),120);else{loginMessage.textContent="";loginForm.reset()}}
function friendlyAuthError(error){const message=String(error?.message||"").toLowerCase();if(message.includes("invalid login credentials"))return "El correo o la contraseña no son correctos.";if(message.includes("email not confirmed"))return "Confirma tu correo electrónico antes de continuar.";if(message.includes("rate limit"))return "Demasiados intentos. Espera un momento y vuelve a probar.";return "No pudimos iniciar sesión. Revisa tus datos e inténtalo de nuevo."}
async function showWorkspace(session){currentUserId=session.user.id;document.body.classList.add("authenticated");setLoginOpen(false);const email=session.user.email||"Usuario";let displayName=session.user.user_metadata?.full_name||email.split("@")[0];const {data:profile}=await supabase.from("profiles").select("display_name,avatar_url").eq("id",session.user.id).maybeSingle();if(profile?.display_name)displayName=profile.display_name;profileName.textContent=displayName;profileAvatar.dataset.fallback=displayName.trim().charAt(0)||"U";profileAvatar.dataset.remoteAvatar=profile?.avatar_url||"";profileAvatar.innerHTML=profile?.avatar_url?`<img src="${profile.avatar_url}" alt="Avatar">`:profileAvatar.dataset.fallback;document.getElementById("sidebarWorkspaceName").textContent=`Espacio de ${displayName}`;window.dispatchEvent(new CustomEvent("node:profile-ready",{detail:{userId:session.user.id}}));if(!dataReady)await initializeData();showInitialGreeting(displayName)}
function showWelcome(){currentUserId=null;document.body.classList.remove("authenticated");dataReady=false;data=structuredClone(defaultData)}

document.getElementById("openLogin").addEventListener("click",()=>setLoginOpen(true));
document.getElementById("closeLogin").addEventListener("click",()=>setLoginOpen(false));
loginModal.addEventListener("click",event=>{if(event.target===loginModal)setLoginOpen(false)});
document.getElementById("togglePassword").addEventListener("click",event=>{const visible=loginPassword.type==="text";loginPassword.type=visible?"password":"text";event.currentTarget.textContent=visible?"Ver":"Ocultar"});
loginForm.addEventListener("submit",async event=>{event.preventDefault();if(!loginForm.reportValidity())return;loginSubmit.disabled=true;loginMessage.textContent="";try{const {data:auth,error}=await supabase.auth.signInWithPassword({email:loginEmail.value.trim(),password:loginPassword.value});if(error)throw error;await showWorkspace(auth.session)}catch(error){loginMessage.textContent=friendlyAuthError(error)}finally{loginSubmit.disabled=false}});
document.getElementById("logoutButton").addEventListener("click",async()=>{await supabase.auth.signOut();showWelcome()});
profileButton.addEventListener("click",event=>{event.stopPropagation();const open=profileMenu.hidden;profileMenu.hidden=!open;profileButton.setAttribute("aria-expanded",String(open))});
document.addEventListener("click",event=>{if(!event.target.closest(".profile-menu-wrap")){profileMenu.hidden=true;profileButton.setAttribute("aria-expanded","false")}});
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&loginModal.classList.contains("open"))setLoginOpen(false)});

const sidebar=document.getElementById("workspaceSidebar"),sidebarTrigger=document.getElementById("workspaceMenu");
const openSidebar=()=>{document.body.classList.add("sidebar-open");sidebarTrigger.setAttribute("aria-expanded","true")};
sidebarTrigger.addEventListener("mouseenter",openSidebar);
sidebarTrigger.addEventListener("click",event=>{event.preventDefault();openSidebar()});
document.getElementById("closeWorkspaceSidebar").addEventListener("click",()=>{document.body.classList.remove("sidebar-open");sidebarTrigger.setAttribute("aria-expanded","false")});
document.addEventListener("click",event=>{if(!document.body.classList.contains("sidebar-open")&&!document.body.classList.contains("notifications-open")&&!document.body.classList.contains("chat-open"))return;if(event.target.closest("#workspaceSidebar,#workspaceMenu,#notificationsPanel,#teamChatPanel"))return;document.body.classList.remove("sidebar-open","notifications-open","chat-open");sidebarTrigger.setAttribute("aria-expanded","false");const notificationsPanel=document.getElementById("notificationsPanel"),chatPanel=document.getElementById("teamChatPanel");if(notificationsPanel)notificationsPanel.hidden=true;if(chatPanel)chatPanel.hidden=true});
document.querySelectorAll('[data-workspace-view="greeting"],[data-workspace-view="talent"]').forEach(button=>button.addEventListener("click",()=>{
 const selected=button.dataset.workspaceView;
 const target=document.getElementById(selected==="talent"?"talentView":"initialGreetingView"),current=document.querySelector(".workspace-view.active:not([hidden])");
 const activate=()=>{document.querySelectorAll(".workspace-view").forEach(view=>{view.hidden=view!==target;view.classList.remove("active","workspace-view-entering")});target.hidden=false;void target.offsetWidth;target.classList.add("active","workspace-view-entering");document.querySelectorAll("[data-workspace-view]").forEach(item=>item.classList.toggle("active",item===button));document.querySelector(".top-title").textContent=selected==="talent"?"Talento Humano":"Inicio";setTimeout(()=>target.classList.remove("workspace-view-entering"),260)};
 if(!current||current===target)activate();else{current.classList.add("workspace-view-leaving");const finish=()=>{current.removeEventListener("animationend",onEnd);current.classList.remove("workspace-view-leaving");activate()};const onEnd=event=>{if(event.target===current)finish()};current.addEventListener("animationend",onEnd);setTimeout(finish,220)}
}));

let sharedTypeSelection=null;
const typeMenu=document.getElementById("typeMenu");
document.addEventListener("open-shared-type-menu",event=>{
 sharedTypeSelection=event.detail;
 const rect=event.detail.trigger.getBoundingClientRect();
 typeMenu.classList.add("open");
 typeMenu.style.left=`${Math.max(8,Math.min(rect.left,window.innerWidth-typeMenu.offsetWidth-8))}px`;
 typeMenu.style.top=`${Math.max(8,Math.min(rect.bottom+5,window.innerHeight-typeMenu.offsetHeight-8))}px`;
 typeMenu.querySelectorAll("[data-type]").forEach(button=>button.classList.toggle("active",button.dataset.type===event.detail.currentType));
});
typeMenu.addEventListener("click",event=>{const button=event.target.closest("[data-type]");if(!button||!sharedTypeSelection)return;const opensSubmenu=Boolean(button.dataset.submenu)||button.dataset.type==="formula";if(!opensSubmenu)typeMenu.classList.remove("open");if(button.dataset.formulaAction==="advanced"){const action=sharedTypeSelection.onAdvanced;setTimeout(()=>action?.(),0);return}if(button.dataset.formulaAction==="progress"){const action=sharedTypeSelection.onProgress;setTimeout(()=>action?.(button),0);return}sharedTypeSelection.onSelect?.(button.dataset.type,{formulaAction:button.dataset.formulaAction||null})});
typeMenu.querySelectorAll("[data-quick-style]").forEach(button=>button.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();sharedTypeSelection?.onQuickFormat?.(button.dataset.quickStyle,null,null)}));
document.getElementById("quickTextColor")?.addEventListener("input",event=>{event.stopPropagation();sharedTypeSelection?.onQuickFormat?.(null,event.target.value,null)});
document.getElementById("quickBackgroundColor")?.addEventListener("input",event=>{event.stopPropagation();sharedTypeSelection?.onQuickFormat?.(null,null,event.target.value)});
document.addEventListener("click",event=>{if(typeMenu.classList.contains("open")&&!typeMenu.contains(event.target)&&!event.target.closest(".type-submenu")&&event.target!==sharedTypeSelection?.trigger)typeMenu.classList.remove("open")});

initHumanTalent({getHumanTalent:()=>data.humanTalent,createHumanTalent:()=>{data.humanTalent={sections:[]};return data.humanTalent},getDirectory:()=>[],getCompanies:()=>[],onHumanTalentChange:saveData});
initCustomWorkspaces({getWorkspaces:()=>data.customWorkspaces,getPrivateWorkspaces:()=>{if(!currentUserId)return[];return data.privateWorkspaces[currentUserId]||(data.privateWorkspaces[currentUserId]=[])},getHomePages:()=>{if(!currentUserId)return[];return data.homePages[currentUserId]||(data.homePages[currentUserId]=[])},getCurrentUserId:()=>currentUserId,onWorkspacesChange:saveData,getDirectory:()=>[],getCompanies:()=>[]});
initInitialGreeting(()=>profileName.textContent.trim()||"Usuario");
initAvatarEditor({openButton:document.getElementById("editAvatarButton"),avatarElement:profileAvatar,getUserId:()=>supabase.auth.getUser().then(({data})=>data.user?.id||"local")});
initMentions({supabase,getUser:()=>supabase.auth.getUser().then(({data})=>data.user)});
initTeamChat({supabase,getUser:()=>supabase.auth.getUser().then(({data})=>data.user)});
try{const {data:{session}}=await supabase.auth.getSession();if(session)await showWorkspace(session);else showWelcome()}catch{showWelcome()}
supabase.auth.onAuthStateChange((event,session)=>{if(event==="SIGNED_OUT")showWelcome();else if(event==="SIGNED_IN"&&session&&!document.body.classList.contains("authenticated"))setTimeout(()=>showWorkspace(session),0)});
