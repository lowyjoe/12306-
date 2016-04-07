package com.lyj.test;


import org.apache.log4j.Logger;


public class Test {
	public static void main(String[] args) {
		/*JDBCUtilSingle jdbcFactory= JDBCUtilSingle.getInitJDBCUtil();
		Connection con= jdbcFactory.getConnection();*/
		Logger log=Logger.getLogger(Test.class); 
		log.error("这是个日志测试");
	}
} 
