// Independent ESC/POS command builder utilities with smart encoding support
// Returns strings where each JS character represents one byte (0-255)

import { SmartEncoder, smartEncode, getCodePageCommand, encodeText } from './SmartEncoder';

// 配置选项
export interface EscPosConfig {
	autoFeedLines?: number; // 自动添加的空行数，默认为3
	enableAutoFeed?: boolean; // 是否启用自动空行，默认为true
}

// 默认配置
const defaultConfig: EscPosConfig = {
	autoFeedLines: 3,
	enableAutoFeed: true
};

let currentConfig: EscPosConfig = { ...defaultConfig };

// 设置配置
function setConfig(config: Partial<EscPosConfig>) {
	currentConfig = { ...currentConfig, ...config };
}

// 获取当前配置
function getConfig(): EscPosConfig {
	return { ...currentConfig };
}

export type Align = 'left'|'center'|'right';
export type ImageMode = 8|24|32; // 8-dot, 24-dot, 32-dot modes
export interface TextStyle {
	align?: Align;
	bold?: boolean;          // Emphasize
	italic?: boolean;        // Italic (若底层驱动支持)
	underline?: boolean;
	width?: 1|2|3|4|5|6|7|8;
	height?: 1|2|3|4|5|6|7|8;
	invert?: boolean;
	doubleStrike?: boolean;
	codePage?: CodePageKey;
	color?:'black'| 'red'
}

export type CodePageKey = 'cp437'|'cp850'|'cp858'|'cp860'|'cp863'|'cp865'|'cp866'|'cp852'|'cp936'|'cp949'|'cp950'|'cp932'|'cp1252'|'cp874'|'cp1256';
const codePageMap: Record<CodePageKey, number> = {
	cp437:0, cp850:2, cp858:19, cp860:3, cp863:4, cp865:5, cp866:17, cp852:18,
	cp936:25, cp949:30, cp950:31, cp932:1, cp1252:16,
	cp874:20, cp1256:21  // 泰文(cp874)和阿拉伯文(cp1256)
};

const ESC='\x1B';
const GS='\x1D';
const DLE='\x10';

function init(){ 
	// 根据配置添加头部空行
	const feedLines = currentConfig.enableAutoFeed ? (currentConfig.autoFeedLines || 0) : 0;
	return feed(feedLines) + ESC; 
}
function setAlign(a:Align){ const map={left:0,center:1,right:2} as const; return ESC+'a'+String.fromCharCode(map[a]); }
function bold(on:boolean){ return ESC+'E'+(on?'\x01':'\x00'); }
function italic(on:boolean){ return ESC+'4'+(on?'\x01':'\x00'); } // ESC 4 n - 斜体开关
function underline(on:boolean){ return ESC+'-'+(on?'\x01':'\x00'); }
function invert(on:boolean){ return ESC+'B'+(on?'\x01':'\x00'); }
function doubleStrike(on:boolean){ return ESC+'G'+(on?'\x01':'\x00'); }
function size(width:1|2|3|4|5|6|7|8=1,height:1|2|3|4|5|6|7|8=1){
    const w=Math.min(8, Math.max(1, (width as number)|0));
    const h=Math.min(8, Math.max(1, (height as number)|0));
    const v=((w-1)<<4)| (h-1);
    return GS+'!'+String.fromCharCode(v);
}
function setCodePage(key:CodePageKey){ return ESC+'t'+String.fromCharCode(codePageMap[key]); }
function line(text:string=''){ return text+'\n'; }
function hr(char='- ', width=48){ let s=''; while(s.length<width) s+=char; return s.slice(0,width)+'\n'; }
function cut(partial:boolean=false){ 
	// 根据配置在切纸前添加尾部空行
	const feedLines = currentConfig.enableAutoFeed ? (currentConfig.autoFeedLines || 0) : 0;
	return feed(feedLines) + GS+'V'+(partial?'1':'0'); 
}

// New common commands
function feed(lines:number=1){ return '\n'.repeat(Math.max(0, lines)); }
function feedDots(dots:number){ // ESC J n : feed n dots (0-255)
	let out='';
	while(dots>0){ const n=Math.min(255,dots); out+=ESC+'J'+String.fromCharCode(n); dots-=n; }
	return out;
}
function reverseFeed(dots:number){ // ESC K n : reverse feed (if supported)
	let out='';
	while(dots>0){ const n=Math.min(255,dots); out+=ESC+'K'+String.fromCharCode(n); dots-=n; }
	return out;
}
function lineSpacing(n?:number){ // ESC 3 n set line spacing; ESC 2 reset default
	if(n===undefined) return ESC+'2';
	return ESC+'3'+String.fromCharCode(Math.min(255, Math.max(0,n)));
}
function charSpacing(n:number){ // ESC SP n
	return ESC+' '+String.fromCharCode(Math.min(255, Math.max(0,n)));
}
function selectFont(font:'A'|'B'='A'){ // ESC M n (0 font A, 1 font B)
	return ESC+'M'+(font==='A'?'\x00':'\x01');
}
function pulse(pin:0|1=0, tOnMs=100, tOffMs=100){ // ESC p m t1 t2 (t1,t2 units 2ms). Cash drawer kick
	const t1=Math.min(255, Math.max(0, Math.round(tOnMs/2)));
	const t2=Math.min(255, Math.max(0, Math.round(tOffMs/2)));
	return ESC+'p'+String.fromCharCode(pin, t1, t2);
}
function beep(times=1, lengthMs=200){ // ESC ( A pL pH m t ; not universal; fallback: BEL (0x07) repeated
	times=Math.min(5, Math.max(1,times));
	const bel='\x07';
	return bel.repeat(times); // simple + compatible
}
function leftMargin(n:number){ // GS L nL nH
	const v=Math.max(0,n); const nL=v & 0xFF; const nH=(v>>8)&0xFF; return GS+'L'+String.fromCharCode(nL,nH);
}
function printArea(width:number){ // GS W nL nH (print area width in dots)
	const v=Math.max(0,width); const nL=v & 0xFF; const nH=(v>>8)&0xFF; return GS+'W'+String.fromCharCode(nL,nH);
}
function rotate(on:boolean){ // ESC V n (some models) OR GS 'V' 1 ???; safer: ESC V n (90° rotation) if supported
	return ESC+'V'+(on?'\x01':'\x00');
}
function upsideDown(on:boolean){ // ESC { n
	return ESC+'{'+(on?'\x01':'\x00');
}

// Barcode
export interface BarcodeOpts {type:'CODE128'|'CODE39'|'EAN13'|'EAN8'|'UPC_A'; height?:number; text?:boolean;}
function barcode(data:string, opts:BarcodeOpts){
	const height=opts.height ?? 80;
	let cmd=GS+'h'+String.fromCharCode(Math.min(255, Math.max(1,height)));
	cmd+=GS+'H'+(opts.text?'\x02':'\x00');
	switch(opts.type){
		case 'CODE128': {
			const content='{B'+data; // force subset B
			return cmd+GS+'k'+String.fromCharCode(73, content.length)+content;
		}
		case 'CODE39': return cmd+GS+'k'+String.fromCharCode(4, data.length)+data;
		case 'EAN13': return cmd+GS+'k'+String.fromCharCode(67, data.length)+data;
		case 'EAN8': return cmd+GS+'k'+String.fromCharCode(68, data.length)+data;
		case 'UPC_A': return cmd+GS+'k'+String.fromCharCode(65, data.length)+data;
	}
}

function applyStyle(style?:TextStyle){
	if(!style) return '';
	let o='';
	if(style.codePage) o+=setCodePage(style.codePage);
	if(style.align) o+=setAlign(style.align);
	if(style.bold!==undefined) o+=bold(style.bold);
	if(style.italic!==undefined) o+=italic(style.italic);
	if(style.underline!==undefined) o+=underline(style.underline);
	if(style.invert!==undefined) o+=invert(style.invert);
	if(style.doubleStrike!==undefined) o+=doubleStrike(style.doubleStrike);
	if(style.width || style.height) o+=size(style.width||1, style.height||1);
	return o;
}

function resetStyle(){
	return bold(false)+italic(false)+underline(false)+invert(false)+doubleStrike(false)+size(1,1)+setAlign('left');
}

function text(txt:string, style?:TextStyle){
	// 根据配置添加尾部空行
	const feedLines = currentConfig.enableAutoFeed ? (currentConfig.autoFeedLines || 0) : 0;
	
	// 使用智能编码转换
	let encodedText = txt;
	let codePageCommand = '';
	
	if (style?.codePage) {
		// 如果指定了编码页，使用指定的编码页
		encodedText = encodeText(txt, 'gbk'); // 对于中文使用gbk编码
		codePageCommand = getCodePageCommand(style.codePage);
	} else {
		// 自动检测语言并选择最佳编码页
		const result = smartEncode(txt);
		encodedText = result.encodedText;
		codePageCommand = result.codePageCommand;
	}
	
	return applyStyle(style) + codePageCommand + encodedText + '\n' + resetStyle() + feed(feedLines);
}
function textBlock(txt:string, opts?:{align?:Align; bold?:boolean; underline?:boolean;}){ return text(txt, opts); }

// QR Code (Model 2) size 1-16, ec 48(L)49(M)50(Q)51(H)
function qrcode(data:string, size:number=6, ec:number=49){
	const model=GS+'(k'+String.fromCharCode(4,0,49,65,50,0);
	const s=GS+'(k'+String.fromCharCode(3,0,49,67,size);
	const e=GS+'(k'+String.fromCharCode(3,0,49,69,ec);
	const utf8:number[]=[];
	for(let i=0;i<data.length;i++){
		const code=data.charCodeAt(i);
		if(code<0x80) utf8.push(code);
		else if(code<0x800) utf8.push(0xC0|(code>>6), 0x80|(code & 0x3F));
		else if(code<0x10000) utf8.push(0xE0|(code>>12),0x80|((code>>6)&0x3F),0x80|(code & 0x3F));
		else utf8.push(0xF0|(code>>18),0x80|((code>>12)&0x3F),0x80|((code>>6)&0x3F),0x80|(code & 0x3F));
	}
	const len=utf8.length+3; const pL=len & 0xFF; const pH=(len>>8)&0xFF;
	const store=GS+'(k'+String.fromCharCode(pL,pH,49,80,48)+String.fromCharCode(...utf8);
	const print=GS+'(k'+String.fromCharCode(3,0,49,81,48);
	return model+s+e+store+print;
}

// Style convenience alias emphasize
function emphasize(on:boolean){ return bold(on); }

// Additional ESC/POS commands
function printAndFeed(lines:number=1){ return '\n'.repeat(Math.max(0, lines)); }
function printAndReverseFeed(lines:number=1){ 
	let out='';
	for(let i=0;i<lines;i++) out+=ESC+'K'+String.fromCharCode(24); // 24 dots = 1 line
	return out;
}
function setPrintMode(mode:number){ return ESC+'!'+String.fromCharCode(mode); }
function setCharacterSet(set:number){ return ESC+'R'+String.fromCharCode(set); }
function setPrintDensity(density:number){ return GS+'7'+String.fromCharCode(density, 0); }
function setCutMode(mode:number){ return GS+'V'+String.fromCharCode(mode); }
function setPrintSpeed(speed:number){ return GS+'s'+String.fromCharCode(speed); }
function setPrintColor(color:number){ return ESC+'r'+String.fromCharCode(color); }
function setPrintDirection(dir:number){ return ESC+'T'+String.fromCharCode(dir); }
function setPrintPosition(pos:number){ return ESC+'$'+String.fromCharCode(pos & 0xFF, (pos >> 8) & 0xFF); }
function setPrintArea(x:number, y:number, width:number, height:number){
	return GS+'P'+String.fromCharCode(x & 0xFF, (x >> 8) & 0xFF, y & 0xFF, (y >> 8) & 0xFF, width & 0xFF, (width >> 8) & 0xFF, height & 0xFF, (height >> 8) & 0xFF);
}

// 多语言便捷打印函数
function printChinese(textStr: string, style?: Omit<TextStyle, 'codePage'>) {
	return text(textStr, { ...style, codePage: 'cp936' });
}

function printJapanese(textStr: string, style?: Omit<TextStyle, 'codePage'>) {
	return text(textStr, { ...style, codePage: 'cp932' });
}

function printKorean(textStr: string, style?: Omit<TextStyle, 'codePage'>) {
	return text(textStr, { ...style, codePage: 'cp949' });
}

function printThai(textStr: string, style?: Omit<TextStyle, 'codePage'>) {
	return text(textStr, { ...style, codePage: 'cp874' });
}

function printArabic(textStr: string, style?: Omit<TextStyle, 'codePage'>) {
	return text(textStr, { ...style, codePage: 'cp1256' });
}

function printRussian(textStr: string, style?: Omit<TextStyle, 'codePage'>) {
	return text(textStr, { ...style, codePage: 'cp866' });
}

function printEnglish(textStr: string, style?: Omit<TextStyle, 'codePage'>) {
	return text(textStr, { ...style, codePage: 'cp437' });
}

// 智能多语言打印（自动检测语言）
function printSmart(textStr: string, style?: Omit<TextStyle, 'codePage'>) {
	return text(textStr, style); // 使用默认的智能检测
}

export const EscPos = {
	// basic
	init, setAlign, bold, italic, underline, invert, doubleStrike, size, setCodePage, line, hr, cut, text, textBlock, qrcode, barcode,
	// extras
	feed, feedDots, reverseFeed, lineSpacing, charSpacing, selectFont, pulse, beep, leftMargin, printArea, rotate, upsideDown, emphasize,
	// advanced
	printAndFeed, printAndReverseFeed, setPrintMode, setCharacterSet, setPrintDensity, setCutMode, setPrintSpeed, setPrintColor, setPrintDirection, setPrintPosition, setPrintArea,
	// config
	setConfig, getConfig,
	// multilingual
	printChinese, printJapanese, printKorean, printThai, printArabic, printRussian, printEnglish, printSmart
} as const;

export default EscPos;

