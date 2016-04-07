package com.lyj.test;

import java.util.Arrays;
import java.util.regex.Matcher;
import java.util.regex.Pattern;


public class TestCpu {

	/**
	 * @Title: main
	 * @Description: TODO(这里用一句话描述这个方法的作用)
	 * @param @param args    设定文件
	 * @return void    返回类型
	 * @author liuyijiao
	 * @date 2016-3-24 上午11:01:48
	 * @version V1.0
	 * @throws
	 */
	public static void main(String[] args) {
		String s="root     10595     1 22 Mar07 ?        3-20:41:34 /usr/local/snort/bin/snort -D -c /usr/local/snort/etc/snort.conf -A fast -i eth0";
		/*Pattern p=Pattern.compile("s+");
		Matcher m=p.matcher(s);
		while(m.find()) { 
		     System.out.println(m.group()); 
		}*/
		String[] sS=s.split("\\s{1,}");
		System.out.println(s.split("\\s{1,}")[4]);
	}

}
