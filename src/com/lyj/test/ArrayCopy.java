package com.lyj.test;



public class ArrayCopy {

	/**
	 * @Title: main
	 * @Description: TODO(这里用一句话描述这个方法的作用)
	 * @param @param args    设定文件
	 * @return void    返回类型
	 * @author liuyijiao
	 * @date 2016-3-9 上午10:58:44
	 * @version V1.0
	 * @throws
	 */
	public static void main(String[] args) {
		int[] src=new int[10];
		int[] des=new int[5];
		ArrayCopy.setArrayVal(src);
		System.arraycopy(src, 0, des, 1, 3);
		outArray(des);

	}
	private static void setArrayVal(int[] array){
		 for(int i=0;i<array.length;i++){
			 array[i]=i;
		 }
	}
	private static void outArray(int[] array){
		 for(int i=0;i<array.length;i++){
			 System.out.println(array[i]);
		 }
	}
}
