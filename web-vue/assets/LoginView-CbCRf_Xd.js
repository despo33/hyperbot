import{d as g,r,c as y,a as t,b as f,e as p,u as o,t as x,w as M,f as h,v as _,g as B,h as v,i as V,o as i}from"./index-CkTTGbTf.js";import{u as z,B as E}from"./bot-DINIEMYw.js";import{c as n}from"./createLucideIcon-C2Ny1EPG.js";/**
 * @license lucide-vue-next v0.561.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const L=n("eye-off",[["path",{d:"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49",key:"ct8e1f"}],["path",{d:"M14.084 14.158a3 3 0 0 1-4.242-4.242",key:"151rxh"}],["path",{d:"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143",key:"13bj9a"}],["path",{d:"m2 2 20 20",key:"1ooewy"}]]);/**
 * @license lucide-vue-next v0.561.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const C=n("eye",[["path",{d:"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",key:"1nclc0"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]]);/**
 * @license lucide-vue-next v0.561.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=n("loader-circle",[["path",{d:"M21 12a9 9 0 1 1-6.219-8.56",key:"13zald"}]]);/**
 * @license lucide-vue-next v0.561.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const q=n("lock",[["rect",{width:"18",height:"11",x:"3",y:"11",rx:"2",ry:"2",key:"1w4ew1"}],["path",{d:"M7 11V7a5 5 0 0 1 10 0v4",key:"fwvmzm"}]]);/**
 * @license lucide-vue-next v0.561.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const S=n("mail",[["path",{d:"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7",key:"132q7q"}],["rect",{x:"2",y:"4",width:"20",height:"16",rx:"2",key:"izxlao"}]]),D={class:"min-h-screen flex items-center justify-center p-4"},N={class:"glass-card w-full max-w-md p-8 animate-scale-in relative z-10"},T={class:"flex flex-col items-center mb-8"},H={class:"w-16 h-16 bg-gradient-to-br from-primary-600 to-primary-400 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-primary-500/30"},I={key:0,class:"mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm"},U={class:"relative"},A=["disabled"],O={class:"relative"},P=["type","disabled"],R=["disabled"],K=g({__name:"LoginView",setup($){const b=V(),k=z(),d=r(""),u=r(""),c=r(!1),a=r(!1),l=r("");async function w(){var m,e;if(!d.value||!u.value){l.value="Veuillez remplir tous les champs";return}a.value=!0,l.value="";try{const s=await k.login(d.value,u.value);s.success?b.push("/"):l.value=s.error||"Erreur de connexion"}catch(s){l.value=((e=(m=s.response)==null?void 0:m.data)==null?void 0:e.error)||"Erreur de connexion au serveur"}finally{a.value=!1}}return(m,e)=>(i(),y("div",D,[e[8]||(e[8]=t("div",{class:"fixed inset-0 overflow-hidden pointer-events-none"},[t("div",{class:"absolute top-1/4 left-1/4 w-96 h-96 bg-primary-600/20 rounded-full blur-3xl"}),t("div",{class:"absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl"})],-1)),t("div",N,[t("div",T,[t("div",H,[p(o(E),{class:"w-8 h-8 text-white"})]),e[3]||(e[3]=t("h1",{class:"text-2xl font-bold text-white"},"Hyperliquid Bot",-1)),e[4]||(e[4]=t("p",{class:"text-dark-400 text-sm mt-1"},"Trading automatisé avec Ichimoku",-1))]),l.value?(i(),y("div",I,x(l.value),1)):f("",!0),t("form",{onSubmit:M(w,["prevent"]),class:"space-y-5"},[t("div",null,[e[5]||(e[5]=t("label",{class:"block text-sm font-medium text-dark-300 mb-2"},"Email",-1)),t("div",U,[p(o(S),{class:"absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500"}),h(t("input",{"onUpdate:modelValue":e[0]||(e[0]=s=>d.value=s),type:"email",placeholder:"votre@email.com",class:"input-field pl-12",disabled:a.value},null,8,A),[[_,d.value]])])]),t("div",null,[e[6]||(e[6]=t("label",{class:"block text-sm font-medium text-dark-300 mb-2"},"Mot de passe",-1)),t("div",O,[p(o(q),{class:"absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500"}),h(t("input",{"onUpdate:modelValue":e[1]||(e[1]=s=>u.value=s),type:c.value?"text":"password",placeholder:"••••••••",class:"input-field pl-12 pr-12",disabled:a.value},null,8,P),[[B,u.value]]),t("button",{type:"button",onClick:e[2]||(e[2]=s=>c.value=!c.value),class:"absolute right-4 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300 transition-colors"},[c.value?(i(),v(o(L),{key:0,class:"w-5 h-5"})):(i(),v(o(C),{key:1,class:"w-5 h-5"}))])])]),t("button",{type:"submit",disabled:a.value,class:"btn-primary w-full py-3 flex items-center justify-center gap-2"},[a.value?(i(),v(o(j),{key:0,class:"w-5 h-5 animate-spin"})):f("",!0),t("span",null,x(a.value?"Connexion...":"Se connecter"),1)],8,R)],32),e[7]||(e[7]=t("p",{class:"text-center text-dark-500 text-sm mt-6"}," © 2024 Hyperliquid Trading Bot ",-1))])]))}});export{K as default};
