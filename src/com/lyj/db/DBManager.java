package com.lyj.db;


import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.SQLException;
import java.util.Properties;

import org.apache.log4j.Logger;
import org.apache.tomcat.dbcp.dbcp.BasicDataSource;


/**
 * 数据库管理器，内实现连接池机制。
 * 
 * @author HanYan
 * @date 2014-09-10
 */
public class DBManager {

	private final static Logger log = Logger.getLogger(DBManager.class);
	private final static String CONFIG_NAME = "jdbc.properties";
    private final static ThreadLocal<Connection> conns = new ThreadLocal<Connection>();
    private static BasicDataSource dataSource;
    private static boolean show_sql = false;
    
    static {
        initDataSource(null);
    }

    /**
     * 初始化连接池
     * @param props
     * @param show_sql
     */
    private final static void initDataSource(Properties dbProperties) {
    	log.info("初始化数据库连接");
        try {
            if(dbProperties == null){
                dbProperties = new Properties();
                dbProperties.load(DBManager.class.getClassLoader().getResourceAsStream(CONFIG_NAME));
            } 
            Properties cp_props = new Properties();
            for(Object key : dbProperties.keySet()) {
                String skey = (String)key;
                if(skey.startsWith("jdbc.")){
                    String name = skey.substring(5);
                    cp_props.put(name, dbProperties.getProperty(skey));
                    if("show_sql".equalsIgnoreCase(name)){
                        show_sql = "true".equalsIgnoreCase(dbProperties.getProperty(skey));
                    }
                }
            }
            dataSource = new BasicDataSource();
            dataSource.setUrl(cp_props.getProperty("url"));
            dataSource.setDriverClassName(cp_props.getProperty("driverClassName"));
            dataSource.setUsername(cp_props.getProperty("username"));
            dataSource.setPassword(cp_props.getProperty("password"));
            dataSource.setDefaultAutoCommit(true);
            dataSource.setMaxActive(Integer.valueOf(cp_props.getProperty("maxActive")));
            dataSource.setMaxIdle(Integer.valueOf(cp_props.getProperty("maxIdle")));
            dataSource.setMaxWait(500);
            log.info("Using DataSource : " + dataSource.getClass().getName());
            Connection conn = getConnection();
            DatabaseMetaData mdm = conn.getMetaData();
            log.info("Connected to " + mdm.getDatabaseProductName() + " " + mdm.getDatabaseProductVersion());
            closeConnection();
        } catch (Exception e) {
        	log.error("数据库管理器初始化失败!", e);
        }
    }
    
    /**
     * 断开连接池
     */
    public final static void closeDataSource(){
        try {
            dataSource.getClass().getMethod("close").invoke(dataSource);
        } catch (NoSuchMethodException e){
        } catch (Exception e) {
            log.error("Unabled to destroy DataSource!!! ", e);
        }
    }

    public final static Connection getConnection() throws SQLException {
        Connection conn = conns.get();
        if(conn ==null || conn.isClosed()){
            conn = dataSource.getConnection();
            conns.set(conn);
        }
        return conn;
    }
    
    /**
     * 关闭连接
     */
    public final static void closeConnection() {
        Connection conn = conns.get();
        try {
            if(conn != null && !conn.isClosed()){
                conn.setAutoCommit(true);
                conn.close();
            }
        } catch (SQLException e) {
            log.error("Unabled to close connection!!! ", e);
        }
        conns.set(null);
    }
 
    /**
     * 用于跟踪执行的SQL语句
     * @author HanYan
     */
    static class _DebugConnection implements InvocationHandler {
         
    	private final static Logger log = Logger.getLogger(_DebugConnection.class);
         
        private Connection conn = null;
 
        public _DebugConnection(Connection conn) {
            this.conn = conn;
        }

        /**
         * Returns the conn.
         * @return Connection
         */
        public Connection getConnection() {
            return (Connection) Proxy.newProxyInstance(conn.getClass().getClassLoader(), 
                             conn.getClass().getInterfaces(), this);
        }
        
        public Object invoke(Object proxy, Method m, Object[] args) throws Throwable {
            try {
                String method = m.getName();
                if("prepareStatement".equals(method) || "createStatement".equals(method))
                    log.info("[SQL] >>> " + args[0]);              
                return m.invoke(conn, args);
            } catch (InvocationTargetException e) {
                throw e.getTargetException();
            }
        }
    }
}
