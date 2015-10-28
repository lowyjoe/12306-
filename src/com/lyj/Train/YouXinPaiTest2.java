package com.lyj.Train;

import java.io.FileOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import net.sf.json.JSONArray;
import net.sf.json.JSONObject;

import org.apache.commons.lang.StringUtils;
import org.apache.poi.hssf.usermodel.HSSFCell;
import org.apache.poi.hssf.usermodel.HSSFCellStyle;
import org.apache.poi.hssf.usermodel.HSSFRow;
import org.apache.poi.hssf.usermodel.HSSFSheet;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.jsoup.Jsoup;
import org.jsoup.helper.StringUtil;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;


public class YouXinPaiTest2 implements Runnable {
	private int beginPage=0;
	private int endPage=0;
	private static Map<String,String> cookieMap=new HashMap<String,String>();
	static{
		cookieMap.put("sto-id-20480", "BOGEBAKMFAAA");
		cookieMap.put("ASP.NET_SessionId", "jzoyu0fbyit1glctljxf2vzw");
		cookieMap.put(".ASPXAUTH", "171B39732536C2DE75B1E46B3B37602EE6972CDD31699A0EEB34F9CE1468F980411D3CE47FC3D573305EA6FDC007D4EF6CFA064CA64AAC38FAB31548DECAAAB40F2F0F968D9FCDD264A021B451FE34CBC369ED1ACB58945AEB63301112C766F0ADE03B7D0DF9AC02A1ED79A9A0717EA02A3218E9AF4F382C647DC576");
	}
	public static void main(String[] args) throws Exception {
		//多线程  不太好  延时不好控制
		/*int fileSize=5;
		for(int i=1;i<=2;i++){
			Thread t=new Thread(new YouXinPaiTest2(1+(i-1)*fileSize, i*fileSize));
			t.start();
		}*/
		// getYouXinPai(1,100,100);
		 /* String ids="9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055,9763,13055";
		getRealName(ids); */
		/*String ids="7827,5043";
		getCompanyName(ids);*/
		//poiExport();
	}
	public  YouXinPaiTest2(int beginPage,int endPage){
		this.beginPage=beginPage;
		this.endPage=endPage;
	}
	@Override
	public void run() {
		getYouXinPai(beginPage,endPage,endPage-beginPage+1);
		//Thread.
	}
	//写入EXCEl 文件
	/**
	 * headList 第一行 头部
	 * bodyList  body部分
	 * nameIds  买卖ids
	 * companyIds  公司ids
	 * fileName  写入文件名称
	 */
	private  static  void  writeFile(Elements headList,List<Elements> bodyList,String nameIds,String companyIds,int fileName){
		// 第一步，创建一个webbook，对应一个Excel文件  
        HSSFWorkbook wb = new HSSFWorkbook();  
        // 第二步，在webbook中添加一个sheet,对应Excel文件中的sheet  
        HSSFSheet sheet = wb.createSheet("优信拍数据");  
        // 第三步，在sheet中添加表头第0行,注意老版本poi对Excel的行数列数有限制short  
        HSSFRow row = sheet.createRow((int) 0);  
        // 第四步，创建单元格，并设置值表头 设置表头居中  
        HSSFCellStyle style = wb.createCellStyle();  
        style.setAlignment(HSSFCellStyle.ALIGN_CENTER); // 创建一个居中格式  
        HSSFCell cell = row.createCell(0);  
        //加入头部信息
        int j=0;
        for(Element ele:headList){
		   cell.setCellValue(ele.text());  
	       cell.setCellStyle(style);  
		   cell = row.createCell(j+1);
		   j++; 
		}
        try {
			Map map=getRealName(nameIds);
			Map mapCompany=getCompanyName(companyIds);
			//for(Element ele:table1TbodyTr){
			for(int m=0;m<bodyList.size();m++){
				Elements tds=bodyList.get(m);
				int k=0;
				row = sheet.createRow(m+1);
				for(Element td:tds){
					String id= td.getElementsByTag("span").attr("rel");
					String name= td.getElementsByTag("span").attr("class");
					if(!StringUtil.isBlank(id)){ 
						if("LinkName".equals(name)){
						//ids.append(id).append(",");
						row.createCell(k).setCellValue(map.get(id).toString()); 
						k++;
						continue;
				         }
						if("CompanyName".equals(name)){
							//ids.append(id).append(",");
							row.createCell(k).setCellValue(mapCompany.get(id).toString()); 
							k++;
							continue;
						}
						
					}
			            // 第四步，创建单元格，并设置值  
			         row.createCell(k).setCellValue(td.text()); 
			         k++;
				}
				/*//卖家 公司名称
				System.out.println(tds.get(23));
				//卖家 联系人
				System.out.println(tds.get(24));
				//买家 公司名称
				System.out.println(tds.get(25));
				//买家 联系人
				System.out.println(tds.get(26));*/
			}
		} catch (Exception e) {
			e.printStackTrace();
		}
		//写入文件
		try  
        {  
            FileOutputStream fout = new FileOutputStream("D:/qyz/1qyz"+fileName+".xls");  
            wb.write(fout);  
            fout.close();  
            Thread.currentThread().interrupt();
        }  
        catch (Exception e)  
        {  
            e.printStackTrace();  
        }  
	}
	 //获取优信拍数据
	public static Object  getYouXinPai(int beginPage,int endPage,int pageSize){
		int rulesOne=(pageSize==0?100:pageSize);
		//int pageCount=5875;
		int pageCount=1000;
		try {
			
			List<Elements> bodyList = new ArrayList<Elements>();
			/*StringBuffer  ids=new StringBuffer();
			StringBuffer  companyIds=new StringBuffer();*/
			Set<String>  ids=new HashSet<String>();
			Set<String>  companyIds=new HashSet<String>();
			for(int i=beginPage;i<=endPage;i++){
				System.out.println("第"+i+"页");
					Document doc= Jsoup.connect("http://admin.youxinpai.com/AggregationPayment54/Index?PageIndex="+i+"&bigArea=0&province=0&city=0&brand=0&auctionstatus=0&hottime=0&PId=&CId=&cPre=&vincode=&TstOrderSerial=&UniqueSerail=&comname=&TimeType=0&tabId=3&StartTime=&EndTime=&superVendorID=-1&serviceTypeQuery=-1&carSourceOwnerQuery=-1&auctionTypeQuery=-1").userAgent("Mozilla/5.0 (Windows NT 5.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/33.0.1750.27 Safari/537.36").cookies(cookieMap).timeout(100*1000).get();
					
					Elements sDataTable=doc.body().getElementsByClass("S_datetable");
					//table1 thead  th头部信息
					Elements table1TheadTh=sDataTable.get(0).getElementsByTag("table").get(0).getElementsByTag("thead").get(0).getElementsByTag("th");
					Elements table1TbodyTr=sDataTable.get(0).getElementsByTag("table").get(0).getElementsByTag("tbody").get(0).getElementsByTag("tr");
					//System.out.println("头部总行数  "+table1TheadTh.size());
					for(Element ele:table1TbodyTr){
						Elements tds=ele.getElementsByTag("td");
						//添加body信息
						bodyList.add(tds);
						for(Element td:tds){
							String id= td.getElementsByTag("span").attr("rel");
							String name= td.getElementsByTag("span").attr("class");
							if(!StringUtil.isBlank(id)&&"LinkName".equals(name)){ 
								//ids.append(id).append(",");
								ids.add(id);
							}
							if(!StringUtil.isBlank(id)&&"CompanyName".equals(name)){ 
								//companyIds.append(id).append(",");
								companyIds.add(id);
							}
						}
						/*//卖家 公司名称
						System.out.println(tds.get(23));
						//卖家 联系人
						System.out.println(tds.get(24));
						//买家 公司名称
						System.out.println(tds.get(25));
						//买家 联系人
						System.out.println(tds.get(26));*/
						//System.out.println("一行结束");
					}
					//String relIDs=ids.toString().substring(0, ids.toString().length()-1);
					//String companyRelIDs=companyIds.toString().substring(0, companyIds.toString().length()-1);
					if(i%rulesOne==0){
						String relIDs=StringUtils.join(ids, ",");
						String companyRelIDs=StringUtils.join(companyIds, ",");
						//TODO: 写入文件
						writeFile(table1TheadTh, bodyList, relIDs, companyRelIDs, i/rulesOne);
						//====================写入结束清空数据
						   bodyList.clear();
						  //卖家  买家 id
						 // ids=new StringBuffer();
						   ids.clear();
						 //所在公司ID
						// companyIds=new StringBuffer();
						   companyIds.clear();
						 //====================写入结束清空数据
						
					}
			}
		} catch (IOException e) {
			e.printStackTrace();
		}
		return null;
	}
	//得到卖家  买家名称
	private static   Map<String,String> getRealName(String ids) throws Exception {
		Map<String, String> resultMap =  new HashMap<String, String>();
		Document res= Jsoup.connect("http://admin.youxinpai.com/AggregationPayment54/GetLinkNames").data("TvuIDs", ids).userAgent("Mozilla/5.0 (Windows NT 5.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/33.0.1750.27 Safari/537.36").cookies(cookieMap).ignoreContentType(true).post();
		Elements resEle=res.getElementsByTag("body");
		JSONArray idJson =JSONArray.fromObject(resEle.get(0).text());
		for (int i = 0; i < idJson.size(); i++) {
			
			JSONObject id= JSONObject.fromObject(idJson.get(i));
			String tvuId= id.get("TvuId").toString();
			String linkName= id.get("LinkName").toString();
			/*  System.out.print("id"+tvuId);
			System.out.print("name"+linkName);
			System.out.println();  */
			resultMap.put(tvuId,linkName);
		}
		
		
		return resultMap;
	}
	//得到公司名称
	private static   Map<String,String> getCompanyName(String ids) throws Exception {
		Map<String, String> resultMap =  new HashMap<String, String>();
		Document res= Jsoup.connect("http://admin.youxinpai.com/AggregationPayment54/GetCompanyNames").data("TvaIDs", ids).userAgent("Mozilla/5.0 (Windows NT 5.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/33.0.1750.27 Safari/537.36").cookies(cookieMap).ignoreContentType(true).post();
		Elements resEle=res.getElementsByTag("body");
		JSONArray idJson =JSONArray.fromObject(resEle.get(0).text());
		for (int i = 0; i < idJson.size(); i++) {
			
			JSONObject id= JSONObject.fromObject(idJson.get(i));
			String tvuId= id.get("TvaID").toString();
			String linkName= id.get("CompanyName").toString();
			/*System.out.print("id"+tvuId);
			System.out.print("name"+linkName);
			System.out.println();*/
			resultMap.put(tvuId,linkName);
		}
		
		return resultMap;
	}
		
}
