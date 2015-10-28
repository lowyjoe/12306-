package com.lyj.db;


/**
 * Something went wrong in the cache
 * @author liudong
 */
public class DBException extends RuntimeException {

	public DBException(String s) {
		super(s);
	}

	public DBException(String s, Throwable e) {
		super(s, e);
	}

	public DBException(Throwable e) {
		super(e);
	}
	
}
