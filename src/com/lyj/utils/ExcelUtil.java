package com.lyj.utils;

import java.text.SimpleDateFormat;
import java.util.Date;

import org.apache.commons.lang.StringUtils;
import org.apache.poi.hssf.usermodel.HSSFCell;
import org.apache.poi.hssf.usermodel.HSSFDateUtil;
import org.apache.poi.hssf.usermodel.HSSFRow;
import org.apache.poi.hssf.usermodel.HSSFSheet;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.hssf.util.HSSFCellUtil;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.util.CellRangeAddress;

public class ExcelUtil  {
    private static String getStringCellValue(Cell cell) {
    	if (cell == null) {
            return "";
        }
    	
        String strCell = "";
        switch (cell.getCellType()) {
        case Cell.CELL_TYPE_STRING:	 // 字符串 
            strCell = cell.getStringCellValue();
            break;
        case Cell.CELL_TYPE_NUMERIC: // 数字  
        	// 时间列改为文本,按文本读取
            if (HSSFDateUtil.isCellDateFormatted(cell)) {
            	double d = cell.getNumericCellValue();
            	Date date = HSSFDateUtil.getJavaDate(d);
            	if(date != null){
            		SimpleDateFormat sFormat = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
            		strCell = sFormat.format(date);
            	}else{
            		strCell = "";
            	}
            }else{
            	strCell =  cell.getNumericCellValue() + "";
            	if(StringUtils.isNotBlank(strCell) && strCell.endsWith(".0")){
            		strCell = strCell.substring(0,strCell.indexOf(".0"));
            	}
            }
            
            break;
        case Cell.CELL_TYPE_BOOLEAN: // Boolean 
            strCell = String.valueOf(cell.getBooleanCellValue());
            break;
        case Cell.CELL_TYPE_FORMULA: // 公式  
        	strCell = cell.getCellFormula();
            break; 
        case Cell.CELL_TYPE_BLANK:   // 空值 
            strCell = "";
            break;
        case Cell.CELL_TYPE_ERROR:   // 故障 
        	strCell = "";
            break;  
        default:
            strCell = "";
            break;
        }
        if (strCell == null) {
            return "";
        }
        return strCell;
    }
    

	/**
	 * 功能：创建HSSFSheet工作簿
	 * @param 	wb	HSSFWorkbook
	 * @param 	sheetName	String
	 * @return	HSSFSheet
	 */
	public static HSSFSheet createSheet(HSSFWorkbook wb,String sheetName, int defaultColumnWidth){
		HSSFSheet sheet=wb.createSheet(sheetName);
//		sheet.setDefaultColumnWidth(defaultColumnWidth);
		return sheet;
	}
	
	/**
	 * 功能：创建HSSFRow
	 * @param 	sheet	HSSFSheet
	 * @param 	rowNum	int
	 * @param 	height	int
	 * @return	HSSFRow
	 */
	public static HSSFRow createRow(HSSFSheet sheet,int rowNum,int height){
		HSSFRow row=sheet.createRow(rowNum);
		row.setHeight((short)height);
		return row;
	}
	
	/**
	 * 功能：创建CELL
	 * @param 	row		HSSFRow	
	 * @param 	cellNum	int
	 * @param 	style	HSSFStyle
	 * @return	HSSFCell
	 */
	public static HSSFCell createCell(HSSFRow row,int cellNum,CellStyle style){
		HSSFCell cell=row.createCell(cellNum);
		cell.setCellStyle(style);
		return cell;
	}
	
	/**
	 * 功能：创建带边框的CellStyle样式
	 * @param 	wb				HSSFWorkbook	
	 * @param 	backgroundColor	背景色	
	 * @param 	foregroundColor	前置色
	 * @param	font			字体
	 * @return	CellStyle
	 */
	public static CellStyle createBorderCellStyle(HSSFWorkbook wb,Font font){
		CellStyle cs=wb.createCellStyle();
		cs.setAlignment(CellStyle.ALIGN_CENTER);
		cs.setVerticalAlignment(CellStyle.VERTICAL_CENTER);
		
		cs.setBorderLeft(CellStyle.BORDER_THIN);
		cs.setBorderRight(CellStyle.BORDER_THIN);
		cs.setBorderTop(CellStyle.BORDER_THIN);
		cs.setBorderBottom(CellStyle.BORDER_THIN);
		
		cs.setFont(font);
		return cs;
	}
	
	/**
	 * 功能：合并单元格
	 * @param 	sheet		HSSFSheet
	 * @param 	firstRow	int
	 * @param 	lastRow		int
	 * @param 	firstColumn	int
	 * @param 	lastColumn	int
	 * @return	int			合并区域号码
	 */
	public static CellRangeAddress mergeCell(HSSFSheet sheet,int firstRow,int lastRow,int firstColumn,int lastColumn){
		CellRangeAddress ca = new CellRangeAddress(firstRow,lastRow,firstColumn,lastColumn);
		sheet.addMergedRegion(ca);
		return ca;
	}
	
	/**
	 * 设置合并单元格的边框样式
	 * @param	sheet	HSSFSheet	
	 * @param 	ca		CellRangAddress
	 * @param 	style	CellStyle
	 */
	public static void setRegionStyle(HSSFSheet sheet, CellRangeAddress ca,CellStyle style) {  
	    for (int i = ca.getFirstRow(); i <= ca.getLastRow(); i++) {  
	        HSSFRow row = HSSFCellUtil.getRow(i, sheet);  
	        for (int j = ca.getFirstColumn(); j <= ca.getLastColumn(); j++) {  
	            HSSFCell cell = HSSFCellUtil.getCell(row, j);  
	            cell.setCellStyle(style);  
	        }  
	    }  
	}  
	
	/**
	 * 功能：创建字体
	 * @param 	wb			HSSFWorkbook	
	 * @param 	boldweight	short
	 * @param 	color		short
	 * @return	Font	
	 */
	public static Font createFont(HSSFWorkbook wb,short boldweight,short size){
		Font font=wb.createFont();
		font.setFontName("宋体");
		font.setBoldweight(boldweight);
		font.setFontHeightInPoints(size);
		return font;
	}
}
