package com.lyj.test;

import java.util.HashMap;
import java.util.Hashtable;
import java.util.Map;


public class StringTest {

	/**
	 * @Title: main
	 * @Description: TODO(这里用一句话描述这个方法的作用)
	 * @param @param args    设定文件
	 * @return void    返回类型
	 * @author liuyijiao
	 * @date 2016-3-9 上午11:23:32
	 * @version V1.0
	 * @throws
	 */
	public static void main(String[] args) {
		//Hashtable 允许空键值  线程安全
		/* Map<String,String> map=new Hashtable<String,String>();
		 System.out.println(map.put(null, "bb"));
		// System.out.println(map.put("a", null));
		System.out.println(map.get("")); 
		System.out.println(map.get("a")); */
		 //HashMap key允许空值 非线程安全
		 Map<String,String> table=new HashMap<String,String>();
		 System.out.println(table.put(null, null));
		 System.out.println(table.put(null, "这是空2"));
		 System.out.println(table.get(null));

	}

}
